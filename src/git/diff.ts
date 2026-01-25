import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type ScanMode = 'working' | 'staged' | 'commit' | 'range';

export interface FileEntry {
  path: string;
  content: string;
  sha?: string;
}

export interface DiffOptions {
  mode: ScanMode;
  commitSha?: string;
  baseRef?: string;
  headRef?: string;
}

const MAX_FILES = 1000;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { 
      cwd, 
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
}

function isBinaryContent(content: string): boolean {
  return content.includes('\0');
}

function getFileContent(repoRoot: string, filePath: string, mode: ScanMode, ref?: string): string | null {
  try {
    let content: string;
    
    switch (mode) {
      case 'working': {
        const fullPath = path.join(repoRoot, filePath);
        if (!fs.existsSync(fullPath)) return null;
        content = fs.readFileSync(fullPath, 'utf-8');
        break;
      }
      case 'staged': {
        content = exec(`git show :${filePath}`, repoRoot);
        break;
      }
      case 'commit':
      case 'range': {
        const gitRef = ref || 'HEAD';
        content = exec(`git show ${gitRef}:${filePath}`, repoRoot);
        break;
      }
      default:
        return null;
    }
    
    if (!content || isBinaryContent(content)) {
      return null;
    }
    
    return content;
  } catch {
    return null;
  }
}

export function collectFiles(repoRoot: string, options: DiffOptions): FileEntry[] {
  let diffCmd: string;
  
  switch (options.mode) {
    case 'working':
      diffCmd = 'git diff --name-only HEAD';
      break;
    case 'staged':
      diffCmd = 'git diff --name-only --cached';
      break;
    case 'commit':
      diffCmd = `git diff --name-only ${options.commitSha}^..${options.commitSha}`;
      break;
    case 'range':
      diffCmd = `git diff --name-only ${options.baseRef}..${options.headRef}`;
      break;
    default:
      throw new Error(`Unknown scan mode: ${options.mode}`);
  }
  
  const output = exec(diffCmd, repoRoot);
  if (!output) {
    return [];
  }
  
  const filePaths = output.split('\n').filter(Boolean);
  
  if (filePaths.length > MAX_FILES) {
    throw new Error(
      `Too many files changed (${filePaths.length}). Maximum is ${MAX_FILES}. ` +
      `Consider narrowing your changes or using --range with a smaller scope.`
    );
  }
  
  const files: FileEntry[] = [];
  let totalBytes = 0;
  
  for (const filePath of filePaths) {
    const ref = options.mode === 'commit' ? options.commitSha : options.headRef;
    const content = getFileContent(repoRoot, filePath, options.mode, ref);
    
    if (content === null) {
      continue;
    }
    
    const fileBytes = Buffer.byteLength(content, 'utf-8');
    totalBytes += fileBytes;
    
    if (totalBytes > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `Total payload exceeds 2MB limit. ` +
        `Consider narrowing your changes or excluding large files.`
      );
    }
    
    files.push({
      path: filePath,
      content,
      sha: exec(`git hash-object ${filePath}`, repoRoot) || undefined,
    });
  }
  
  return files;
}

export function getScanModeFromOptions(options: {
  staged?: boolean;
  commit?: string;
  range?: string;
  file?: string;
}): DiffOptions & { singleFile?: string } {
  if (options.file) {
    return { mode: 'working', singleFile: options.file };
  }
  
  if (options.staged) {
    return { mode: 'staged' };
  }
  
  if (options.commit) {
    return { mode: 'commit', commitSha: options.commit };
  }
  
  if (options.range) {
    const [baseRef, headRef] = options.range.split('..');
    if (!baseRef || !headRef) {
      throw new Error('Range must be in format: base..head');
    }
    return { mode: 'range', baseRef, headRef };
  }
  
  return { mode: 'working' };
}

export function collectSingleFile(repoRoot: string, filePath: string): FileEntry | null {
  const fullPath = path.join(repoRoot, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    if (isBinaryContent(content)) {
      return null;
    }
    
    return {
      path: filePath,
      content,
      sha: exec(`git hash-object "${filePath}"`, repoRoot) || undefined,
    };
  } catch {
    return null;
  }
}

const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.tf', '.yaml', '.yml', '.json',
  '.cs', '.kt', '.scala', '.swift',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 
  '.next', '.nuxt', 'vendor', '__pycache__', '.venv',
  'target', 'bin', 'obj', '.terraform', '.cache',
]);

export function collectAllFiles(repoRoot: string): FileEntry[] {
  const files: FileEntry[] = [];
  let totalBytes = 0;
  
  function walkDir(dir: string, relativePath: string = '') {
    if (files.length >= MAX_FILES) return;
    
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walkDir(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCANNABLE_EXTENSIONS.has(ext)) continue;
        
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (isBinaryContent(content)) continue;
          
          const fileBytes = Buffer.byteLength(content, 'utf-8');
          if (totalBytes + fileBytes > MAX_PAYLOAD_BYTES) {
            continue;
          }
          totalBytes += fileBytes;
          
          files.push({
            path: relPath,
            content,
            sha: exec(`git hash-object "${relPath}"`, repoRoot) || undefined,
          });
        } catch {
          continue;
        }
      }
    }
  }
  
  walkDir(repoRoot);
  return files;
}
