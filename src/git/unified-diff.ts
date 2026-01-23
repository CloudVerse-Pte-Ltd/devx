import { execSync } from 'child_process';
import * as crypto from 'crypto';

export interface UnifiedDiff {
  format: 'unified';
  unified: number;
  text: string;
  hash: string;
  sizeBytes: number;
}

export interface FileMeta {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C';
  additions: number;
  deletions: number;
}

export interface DiffPayload {
  diff: UnifiedDiff;
  filesMeta: FileMeta[];
}

const MAX_DIFF_SIZE = 2 * 1024 * 1024;

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

export function getUnifiedDiff(
  repoRoot: string,
  mode: 'working' | 'staged' | 'commit' | 'range',
  options?: { baseRef?: string; headRef?: string; commitSha?: string }
): DiffPayload | null {
  let diffCmd: string;
  let statCmd: string;
  
  switch (mode) {
    case 'working':
      diffCmd = 'git diff HEAD --unified=3';
      statCmd = 'git diff HEAD --numstat';
      break;
    case 'staged':
      diffCmd = 'git diff --cached --unified=3';
      statCmd = 'git diff --cached --numstat';
      break;
    case 'commit':
      diffCmd = `git diff ${options?.commitSha}^..${options?.commitSha} --unified=3`;
      statCmd = `git diff ${options?.commitSha}^..${options?.commitSha} --numstat`;
      break;
    case 'range':
      diffCmd = `git diff ${options?.baseRef}..${options?.headRef} --unified=3`;
      statCmd = `git diff ${options?.baseRef}..${options?.headRef} --numstat`;
      break;
    default:
      return null;
  }
  
  const diffText = exec(diffCmd, repoRoot);
  
  if (!diffText) {
    return null;
  }
  
  const sizeBytes = Buffer.byteLength(diffText, 'utf-8');
  
  if (sizeBytes > MAX_DIFF_SIZE) {
    return null;
  }
  
  const hash = crypto.createHash('sha256').update(diffText).digest('hex');
  
  const statOutput = exec(statCmd, repoRoot);
  const filesMeta: FileMeta[] = [];
  
  if (statOutput) {
    const lines = statOutput.split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts[2];
        
        let status: FileMeta['status'] = 'M';
        if (additions > 0 && deletions === 0) {
          status = 'A';
        } else if (additions === 0 && deletions > 0) {
          status = 'D';
        }
        
        filesMeta.push({
          path: filePath,
          status,
          additions,
          deletions,
        });
      }
    }
  }
  
  return {
    diff: {
      format: 'unified',
      unified: 3,
      text: diffText,
      hash,
      sizeBytes,
    },
    filesMeta,
  };
}

export function getDiffHash(
  repoRoot: string,
  mode: 'working' | 'staged' | 'commit' | 'range',
  options?: { baseRef?: string; headRef?: string; commitSha?: string }
): string {
  const payload = getUnifiedDiff(repoRoot, mode, options);
  
  if (!payload) {
    return crypto.createHash('sha256').update('empty').digest('hex');
  }
  
  return payload.diff.hash;
}
