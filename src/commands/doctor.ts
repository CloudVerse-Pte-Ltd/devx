import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getConfig, isAuthenticated, getMaskedToken } from '../config/store';
import { ping, ApiError, PingResponse } from '../api/client';

interface DoctorResult {
  auth: { status: 'ok' | 'fail'; details: string };
  backend: { status: 'ok' | 'fail'; details: string; latencyMs?: number };
  git: { status: 'ok' | 'fail'; details: string; inRepo?: boolean; provider?: string; defaultBranch?: string };
  hooks: { preCommit: 'installed' | 'not_installed'; prePush: 'installed' | 'not_installed' };
  payload: { status: 'ok' | 'warn' | 'fail'; details: string; stagedFiles?: number; stagedBytes?: number; workingFiles?: number; workingBytes?: number };
  cliEnabled?: boolean;
}

interface DataBoundary {
  sends: string[];
  doesNotSend: string[];
  limits: { maxFiles: number; maxBytes: number };
  currentPayload: {
    stagedFiles: number;
    stagedBytes: number;
    workingFiles: number;
    workingBytes: number;
  };
}

const DEVX_HOOK_MARKER = '# CloudVerse DevX Hook';
const MAX_FILES = 100;
const MAX_BYTES = 5 * 1024 * 1024;

function checkAuth(): DoctorResult['auth'] {
  const config = getConfig();

  if (!fs.existsSync(path.join(require('os').homedir(), '.cloudverse', 'devx', 'config.json'))) {
    return { status: 'fail', details: 'Config file not found. Run: devx auth login' };
  }

  if (!config.accessToken) {
    return { status: 'fail', details: 'No access token. Run: devx auth login' };
  }

  if (!config.orgId || !config.userId) {
    return { status: 'fail', details: 'Incomplete auth config. Run: devx auth login' };
  }

  return {
    status: 'ok',
    details: `orgId=${config.orgId.substring(0, 8)}..., userId=${config.userId.substring(0, 8)}..., token=${getMaskedToken(config.accessToken)}`,
  };
}

async function checkBackend(): Promise<{ result: DoctorResult['backend']; pingResponse?: PingResponse }> {
  const config = getConfig();

  if (!config.accessToken) {
    return { result: { status: 'fail', details: 'Not authenticated' } };
  }

  const start = Date.now();
  try {
    const response = await ping();
    const latencyMs = Date.now() - start;

    if (!response.cliEnabled) {
      return {
        result: { status: 'fail', details: 'DevX CLI disabled by organization policy.', latencyMs },
        pingResponse: response,
      };
    }

    return {
      result: { status: 'ok', details: `Connected to ${config.apiBaseUrl} (${latencyMs}ms)`, latencyMs },
      pingResponse: response,
    };
  } catch (e) {
    const latencyMs = Date.now() - start;
    if (e instanceof ApiError) {
      if (e.statusCode === 401) {
        return { result: { status: 'fail', details: 'Auth expired or device revoked. Run: devx auth login', latencyMs } };
      }
      if (e.statusCode === 429) {
        return { result: { status: 'fail', details: 'Usage limit reached.', latencyMs } };
      }
      if (e.statusCode === 403) {
        return { result: { status: 'fail', details: 'DevX CLI disabled by organization policy.', latencyMs } };
      }
      return { result: { status: 'fail', details: `API error: ${e.message}`, latencyMs } };
    }
    if (e instanceof Error) {
      return { result: { status: 'fail', details: `Connection failed: ${e.message}`, latencyMs } };
    }
    return { result: { status: 'fail', details: 'Unknown error', latencyMs } };
  }
}

function checkGit(): DoctorResult['git'] {
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    let remoteUrl = '';
    try {
      remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return { status: 'fail', details: 'No remote origin configured', inRepo: true };
    }

    let provider = 'unknown';
    if (remoteUrl.includes('github.com')) provider = 'github';
    else if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) provider = 'gitlab';
    else if (remoteUrl.includes('bitbucket')) provider = 'bitbucket';
    else if (remoteUrl.includes('azure') || remoteUrl.includes('dev.azure.com')) provider = 'azure';

    let defaultBranch = 'main';
    try {
      execSync('git rev-parse --verify origin/main', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });
      defaultBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify origin/master', { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });
        defaultBranch = 'master';
      } catch {
        defaultBranch = 'unknown';
      }
    }

    return {
      status: 'ok',
      details: `In git repo, provider=${provider}, defaultBranch=${defaultBranch}`,
      inRepo: true,
      provider,
      defaultBranch,
    };
  } catch {
    return { status: 'fail', details: 'Not in a git repository', inRepo: false };
  }
}

function checkHooks(): DoctorResult['hooks'] {
  let preCommit: 'installed' | 'not_installed' = 'not_installed';
  let prePush: 'installed' | 'not_installed' = 'not_installed';

  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const hooksDir = path.join(repoRoot, '.git', 'hooks');

    const preCommitPath = path.join(hooksDir, 'pre-commit');
    if (fs.existsSync(preCommitPath)) {
      const content = fs.readFileSync(preCommitPath, 'utf-8');
      if (content.includes(DEVX_HOOK_MARKER)) {
        preCommit = 'installed';
      }
    }

    const prePushPath = path.join(hooksDir, 'pre-push');
    if (fs.existsSync(prePushPath)) {
      const content = fs.readFileSync(prePushPath, 'utf-8');
      if (content.includes(DEVX_HOOK_MARKER)) {
        prePush = 'installed';
      }
    }
  } catch {
    // Not in git repo, hooks cannot be checked
  }

  return { preCommit, prePush };
}

function checkPayload(): DoctorResult['payload'] {
  let stagedFiles = 0;
  let stagedBytes = 0;
  let workingFiles = 0;
  let workingBytes = 0;

  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    try {
      const stagedOutput = execSync('git diff --cached --name-only', { encoding: 'utf-8', cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (stagedOutput) {
        const files = stagedOutput.split('\n').filter(f => f);
        stagedFiles = files.length;
        for (const file of files) {
          const fullPath = path.join(repoRoot, file);
          if (fs.existsSync(fullPath)) {
            try {
              const stats = fs.statSync(fullPath);
              stagedBytes += stats.size;
            } catch {
              // File might be deleted
            }
          }
        }
      }
    } catch {
      // No staged files
    }

    try {
      const workingOutput = execSync('git diff --name-only', { encoding: 'utf-8', cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (workingOutput) {
        const files = workingOutput.split('\n').filter(f => f);
        workingFiles = files.length;
        for (const file of files) {
          const fullPath = path.join(repoRoot, file);
          if (fs.existsSync(fullPath)) {
            try {
              const stats = fs.statSync(fullPath);
              workingBytes += stats.size;
            } catch {
              // File might be deleted
            }
          }
        }
      }
    } catch {
      // No working tree changes
    }

    const totalFiles = stagedFiles + workingFiles;
    const totalBytes = stagedBytes + workingBytes;

    if (totalFiles > MAX_FILES || totalBytes > MAX_BYTES) {
      return {
        status: 'warn',
        details: `Payload exceeds limits: files=${totalFiles}/${MAX_FILES}, bytes=${formatBytes(totalBytes)}/${formatBytes(MAX_BYTES)}`,
        stagedFiles,
        stagedBytes,
        workingFiles,
        workingBytes,
      };
    }

    return {
      status: 'ok',
      details: `files=${totalFiles}, bytes=${formatBytes(totalBytes)}`,
      stagedFiles,
      stagedBytes,
      workingFiles,
      workingBytes,
    };
  } catch {
    return { status: 'fail', details: 'Not in a git repository' };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDataBoundary(payload: DoctorResult['payload']): DataBoundary {
  return {
    sends: [
      'Changed file paths + file sizes + content for changed files only',
      'Git metadata: branch name, commit SHA, repository name',
      'Machine identifier (random UUID for rate limiting)',
    ],
    doesNotSend: [
      'Full repository contents',
      'Git history',
      'Environment variables or secrets',
      'Unchanged files',
      'System information beyond OS type',
    ],
    limits: {
      maxFiles: MAX_FILES,
      maxBytes: MAX_BYTES,
    },
    currentPayload: {
      stagedFiles: payload.stagedFiles || 0,
      stagedBytes: payload.stagedBytes || 0,
      workingFiles: payload.workingFiles || 0,
      workingBytes: payload.workingBytes || 0,
    },
  };
}

function renderHuman(result: DoctorResult, dataMode: boolean): void {
  console.log('');
  console.log('CloudVerse DevX — Doctor');
  console.log('');
  console.log(`Auth:    ${result.auth.status === 'ok' ? 'OK' : 'FAIL'} (${result.auth.details})`);
  console.log(`Backend: ${result.backend.status === 'ok' ? 'OK' : 'FAIL'} (${result.backend.details})`);
  console.log(`Git:     ${result.git.status === 'ok' ? 'OK' : 'FAIL'} (${result.git.details})`);
  console.log(`Hooks:   pre-commit ${result.hooks.preCommit}, pre-push ${result.hooks.prePush}`);
  console.log(`Payload: ${result.payload.status === 'ok' ? 'OK' : result.payload.status === 'warn' ? 'WARN' : 'FAIL'} (${result.payload.details})`);
  console.log('');

  if (dataMode) {
    const boundary = getDataBoundary(result.payload);
    console.log('--- Data Boundary ---');
    console.log('');
    console.log('SENDS:');
    for (const item of boundary.sends) {
      console.log(`  - ${item}`);
    }
    console.log('');
    console.log('DOES NOT SEND:');
    for (const item of boundary.doesNotSend) {
      console.log(`  - ${item}`);
    }
    console.log('');
    console.log('LIMITS:');
    console.log(`  Max files: ${boundary.limits.maxFiles}`);
    console.log(`  Max bytes: ${formatBytes(boundary.limits.maxBytes)}`);
    console.log('');
    console.log('CURRENT PAYLOAD:');
    console.log(`  Staged: ${boundary.currentPayload.stagedFiles} files, ${formatBytes(boundary.currentPayload.stagedBytes)}`);
    console.log(`  Working: ${boundary.currentPayload.workingFiles} files, ${formatBytes(boundary.currentPayload.workingBytes)}`);
    console.log('');
  }
}

function renderJson(result: DoctorResult, dataMode: boolean): void {
  const output: Record<string, unknown> = {
    auth: result.auth,
    backend: result.backend,
    git: result.git,
    hooks: result.hooks,
    payload: result.payload,
  };

  if (result.cliEnabled !== undefined) {
    output.cliEnabled = result.cliEnabled;
  }

  if (dataMode) {
    output.dataBoundary = getDataBoundary(result.payload);
  }

  console.log(JSON.stringify(output, null, 2));
}

async function doctor(options: { data?: boolean; json?: boolean }): Promise<void> {
  const authResult = checkAuth();
  const backendCheck = await checkBackend();
  const gitResult = checkGit();
  const hooksResult = checkHooks();
  const payloadResult = checkPayload();

  const result: DoctorResult = {
    auth: authResult,
    backend: backendCheck.result,
    git: gitResult,
    hooks: hooksResult,
    payload: payloadResult,
    cliEnabled: backendCheck.pingResponse?.cliEnabled,
  };

  if (options.json) {
    renderJson(result, !!options.data);
  } else {
    renderHuman(result, !!options.data);
  }

  if (result.backend.status === 'fail' && backendCheck.pingResponse?.cliEnabled === false) {
    process.exit(3);
  }
}

export function createDoctorCommand(): Command {
  const cmd = new Command('doctor')
    .description('Diagnose CLI auth, connectivity, git, hooks, and payload')
    .option('--data', 'Show exactly what data CLI sends to the server')
    .option('--json', 'Output in JSON format')
    .action(doctor);

  return cmd;
}
