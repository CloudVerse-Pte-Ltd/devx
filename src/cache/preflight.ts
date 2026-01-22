import { execSync } from 'child_process';
import * as path from 'path';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.java', '.kt', '.kts', '.scala',
  '.go',
  '.rs',
  '.rb', '.erb',
  '.php',
  '.cs', '.fs', '.vb',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.swift', '.m', '.mm',
  '.lua', '.pl', '.pm', '.r', '.R',
  '.sql', '.prisma',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
  '.ex', '.exs',
  '.hs', '.elm', '.clj', '.cljs', '.edn',
]);

const IAC_EXTENSIONS = new Set([
  '.tf', '.tfvars', '.tf.json',
  '.hcl',
  '.bicep',
  '.pp',
  '.nix',
]);

const IAC_FILENAMES = new Set([
  'Dockerfile',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'serverless.yml',
  'serverless.yaml',
  'kustomization.yml',
  'kustomization.yaml',
  'helmfile.yml',
  'helmfile.yaml',
  'pulumi.yaml',
  'pulumi.yml',
  'cloudformation.json',
  'cloudformation.yaml',
  'cloudformation.yml',
  'template.json',
  'template.yaml',
  'cdk.json',
  'samconfig.toml',
]);

const IAC_PATH_PATTERNS = [
  /\/kubernetes\//i,
  /\/k8s\//i,
  /\/helm\//i,
  /\/charts\//i,
  /\/manifests\//i,
  /\/deploy\//i,
  /\/infra\//i,
  /\/infrastructure\//i,
  /\/terraform\//i,
  /\/pulumi\//i,
  /\/cloudformation\//i,
  /\/cdk\.out\//i,
  /\/\.github\/workflows\//i,
  /\/stacks\//i,
  /\/templates\//i,
];

const NON_IAC_FILES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'jsconfig.json',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'babel.config.json',
  'jest.config.json',
  'renovate.json',
  'dependabot.yml',
  '.editorconfig',
  'angular.json',
  'vite.config.json',
  '.devcontainer.json',
  'devcontainer.json',
  'settings.json',
  'launch.json',
  'extensions.json',
  'workspace.xml',
  'composer.json',
  'composer.lock',
  'Gemfile',
  'Gemfile.lock',
  'requirements.txt',
  'setup.py',
  'pyproject.toml',
  'poetry.lock',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  '.devxrc',
  '.gitignore',
  '.dockerignore',
  '.npmrc',
  '.yarnrc',
  '.nvmrc',
  '.node-version',
  '.python-version',
  '.ruby-version',
  '.tool-versions',
  'mkdocs.yml',
  'mkdocs.yaml',
  '_config.yml',
  '_config.yaml',
  'codecov.yml',
  'codecov.yaml',
]);

const NON_IAC_PATH_PATTERNS = [
  /\/docs?\//i,
  /\/documentation\//i,
  /\/examples?\//i,
  /\/samples?\//i,
  /\/\.vscode\//i,
  /\/\.idea\//i,
  /\/\.git\//i,
  /\/node_modules\//i,
  /\/vendor\//i,
  /\/test\//i,
  /\/tests\//i,
  /\/__tests__\//i,
  /\/spec\//i,
  /\/fixtures?\//i,
];

export interface PreflightResult {
  hasRelevantChanges: boolean;
  codeFiles: string[];
  iacFiles: string[];
  totalFiles: string[];
  reason?: string;
}

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { 
      cwd, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
}

function isIaCByPath(filePath: string): boolean {
  const normalizedPath = '/' + filePath;
  return IAC_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function isNonIaCByPath(filePath: string): boolean {
  const normalizedPath = '/' + filePath;
  return NON_IAC_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function classifyFile(filePath: string): 'code' | 'iac' | 'none' {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  
  if (isNonIaCByPath(filePath) && !isIaCByPath(filePath)) {
    if (CODE_EXTENSIONS.has(ext)) {
      return 'code';
    }
    return 'none';
  }
  
  if (NON_IAC_FILES.has(filename)) {
    return 'none';
  }
  
  if (IAC_FILENAMES.has(filename)) {
    return 'iac';
  }
  
  if (IAC_EXTENSIONS.has(ext)) {
    return 'iac';
  }
  
  if (isIaCByPath(filePath)) {
    if (ext === '.yaml' || ext === '.yml' || ext === '.json' || ext === '.tpl') {
      return 'iac';
    }
  }
  
  if (CODE_EXTENSIONS.has(ext)) {
    return 'code';
  }
  
  return 'none';
}

export function runPreflight(
  repoRoot: string,
  mode: 'working' | 'staged' | 'commit' | 'range',
  options?: { baseRef?: string; headRef?: string; commitSha?: string }
): PreflightResult {
  let diffCmd: string;
  
  switch (mode) {
    case 'working':
      diffCmd = 'git diff --name-only HEAD';
      break;
    case 'staged':
      diffCmd = 'git diff --name-only --cached';
      break;
    case 'commit':
      diffCmd = `git diff --name-only ${options?.commitSha}^..${options?.commitSha}`;
      break;
    case 'range':
      diffCmd = `git diff --name-only ${options?.baseRef}..${options?.headRef}`;
      break;
    default:
      return {
        hasRelevantChanges: false,
        codeFiles: [],
        iacFiles: [],
        totalFiles: [],
        reason: 'Unknown scan mode',
      };
  }
  
  const output = exec(diffCmd, repoRoot);
  
  if (!output) {
    return {
      hasRelevantChanges: false,
      codeFiles: [],
      iacFiles: [],
      totalFiles: [],
      reason: 'No files changed',
    };
  }
  
  const allFiles = output.split('\n').filter(Boolean);
  const codeFiles: string[] = [];
  const iacFiles: string[] = [];
  
  for (const file of allFiles) {
    const type = classifyFile(file);
    if (type === 'code') {
      codeFiles.push(file);
    } else if (type === 'iac') {
      iacFiles.push(file);
    }
  }
  
  const hasRelevantChanges = codeFiles.length > 0 || iacFiles.length > 0;
  
  return {
    hasRelevantChanges,
    codeFiles,
    iacFiles,
    totalFiles: allFiles,
    reason: hasRelevantChanges ? undefined : 'No relevant code/IaC changes detected',
  };
}
