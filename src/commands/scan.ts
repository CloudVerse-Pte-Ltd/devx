import { Command } from 'commander';
import * as fs from 'fs';
import { execSync, spawn } from 'child_process';
import { getConfig, isAuthenticated } from '../config/store';
import { resolveGitContext, validateGitContext } from '../git/resolve';
import { collectFiles, getScanModeFromOptions, collectSingleFile, collectAllFiles, FileEntry } from '../git/diff';
import { analyze, getClientInfo, ApiError, AnalyzeResponse, Finding } from '../api/client';
import { renderTable, renderPlain } from '../output/render';
import { renderSarif } from '../output/sarif';
import { runPreflight } from '../cache/preflight';
import { 
  getCacheEntry, 
  setCacheEntry, 
  computeCacheKey, 
  DEFAULT_TTL_WORKING, 
  DEFAULT_TTL_RANGE 
} from '../cache/store';
import { getUnifiedDiff, getDiffHash } from '../git/unified-diff';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

interface ScanOptions {
  staged?: boolean;
  commit?: string;
  range?: string | boolean;
  file?: string;
  all?: boolean;
  format?: 'plain' | 'json' | 'sarif';
  out?: string;
  verbose?: boolean;
  warn?: boolean;
  quiet?: boolean;
  noCache?: boolean;
  cacheTtl?: number;
  async?: boolean;
  sync?: boolean;
  timeout?: number;
  refreshCacheOnly?: boolean;
}

function detectDefaultBranch(repoRoot: string): string {
  try {
    execSync('git rev-parse --verify origin/main', { cwd: repoRoot, stdio: 'pipe' });
    return 'main';
  } catch {
    try {
      execSync('git rev-parse --verify origin/master', { cwd: repoRoot, stdio: 'pipe' });
      return 'master';
    } catch {
      return 'main';
    }
  }
}

function hasNonAdvisoryFindings(response: AnalyzeResponse): boolean {
  return response.findings.some(f => f.severity === 'medium' || f.severity === 'high');
}

function renderJsonFindings(response: AnalyzeResponse): string {
  const output = {
    decision: response.decision,
    findings: response.findings.map((f: Finding) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      file: f.file,
      line: f.line,
      column: undefined,
      message: f.message,
      estimatedImpact: f.costImpact || undefined,
    })),
  };
  return JSON.stringify(output, null, 2);
}

function renderFindingDetails(finding: Finding): string[] {
  const lines: string[] = [];
  const severityColors: Record<string, string> = { high: '🔴', medium: '🟡', low: '🔵' };
  const icon = severityColors[finding.severity] || '⚪';
  
  lines.push(`${icon} ${finding.severity.toUpperCase()}: ${finding.title}`);
  lines.push(`   File: ${finding.file}:${finding.line}`);
  
  if (finding.message) {
    lines.push(`   Why: ${finding.message}`);
  }
  
  if (finding.recommendation) {
    lines.push(`   Fix: ${finding.recommendation}`);
  }
  
  if (finding.costImpact) {
    lines.push(`   Impact: ${finding.costImpact}`);
  }
  
  return lines;
}

function renderBlockMessage(response: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(color('CloudVerse DevX: BLOCKED', COLORS.red, COLORS.bold));
  lines.push('');
  
  const blockingFindings = response.findings.filter(f => f.severity === 'high');
  for (const finding of blockingFindings.slice(0, 5)) {
    lines.push(...renderFindingDetails(finding));
    lines.push('');
  }
  
  if (blockingFindings.length > 5) {
    lines.push(`  ... and ${blockingFindings.length - 5} more`);
  }
  
  lines.push('Fix the findings or bypass with: --no-verify');
  lines.push('');
  
  return lines.join('\n');
}

function renderWarnMessage(response: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(color('CloudVerse DevX: WARNING', COLORS.orange, COLORS.bold));
  lines.push('');
  
  const warnFindings = response.findings.filter(f => f.severity === 'medium' || f.severity === 'high');
  for (const finding of warnFindings.slice(0, 5)) {
    lines.push(...renderFindingDetails(finding));
    lines.push('');
  }
  
  if (warnFindings.length > 5) {
    lines.push(`  ... and ${warnFindings.length - 5} more`);
  }
  
  return lines.join('\n');
}

function renderPassMessage(cached?: boolean): string {
  const suffix = cached ? ' (cached)' : '';
  return color(`  ✓ No cost findings detected.${suffix}`, COLORS.green, COLORS.bold);
}

function renderNoFilesMessage(msg: string): string {
  return color(`  ✓ ${msg}`, COLORS.green);
}

function renderCachedMessage(decision: string, ms?: number): string {
  const timing = ms ? ` ${ms}ms` : '';
  if (decision === 'pass') {
    return color(`DevX: PASS (cached)${timing}`, COLORS.green);
  } else if (decision === 'block') {
    return color(`DevX: BLOCK (cached)${timing}`, COLORS.red);
  }
  return color(`DevX: ${decision.toUpperCase()} (cached)${timing}`, COLORS.yellow);
}

function renderAsyncPendingMessage(): string {
  return color('DevX: analyzing... (will cache)', COLORS.yellow);
}

function renderTimeoutMessage(): string {
  return color('DevX: analysis pending (timed out locally). PR checks will enforce policy.', COLORS.yellow);
}

function startBackgroundRefresh(args: string[]): void {
  const child = spawn(process.execPath, [process.argv[1], ...args, '--sync', '--quiet', '--refresh-cache-only'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function analyzeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ result: T; timedOut: false } | { result: null; timedOut: true }> {
  return Promise.race([
    promise.then(result => ({ result, timedOut: false as const })),
    new Promise<{ result: null; timedOut: true }>(resolve => 
      setTimeout(() => resolve({ result: null, timedOut: true }), timeoutMs)
    ),
  ]);
}

function cacheResult(
  remoteUrl: string,
  mode: string,
  diffHash: string,
  response: AnalyzeResponse,
  customTtl?: number
): void {
  const ttl = customTtl || (mode === 'range' ? DEFAULT_TTL_RANGE : DEFAULT_TTL_WORKING);
  const cacheKey = computeCacheKey({ remoteUrl, mode, diffHash });
  setCacheEntry(cacheKey, response, diffHash, ttl);
}

import { renderTerminal } from '../output/terminal';
import { applyGatingLogic, Finding as GatingFinding } from '../output/gating';

function mapToGatingFinding(f: Finding): GatingFinding {
  return {
    ruleId: f.ruleId,
    severity: f.severity as any,
    title: f.title,
    file: f.file,
    line: f.line,
    message: f.message,
    recommendation: f.recommendation,
    category: (f as any).category || 'governance',
    confidence: (f as any).confidence || 0.9,
  };
}

function outputResults(response: AnalyzeResponse, options: ScanOptions, mode: 'pre-commit' | 'pre-push' | 'manual' = 'manual'): void {
  if (options.format === 'json') {
    console.log(renderJsonFindings(response));
    return;
  }
  if (options.format === 'sarif') {
    console.log(renderSarif(response));
    return;
  }

  const gatingFindings = response.findings.map(mapToGatingFinding);
  const gatingResult = applyGatingLogic(gatingFindings, response.decision, mode);
  const terminalOutput = renderTerminal(gatingResult, mode);
  
  if (terminalOutput) {
    console.log(terminalOutput);
  } else if (!options.quiet && response.decision === 'pass') {
    console.log(renderPassMessage());
  }
}


function exitWithDecision(response: AnalyzeResponse): never {
  if (response.decision === 'block') {
    process.exit(2);
  }
  
  if (response.decision === 'warn' || hasNonAdvisoryFindings(response)) {
    process.exit(1);
  }
  
  process.exit(0);
}

async function scan(options: ScanOptions): Promise<void> {
  const startTime = Date.now();
  
  if (!isAuthenticated()) {
    console.log('');
    console.log('CloudVerse DevX CLI');
    console.log('To continue, authenticate this device.');
    console.log('');
    console.log('Run:');
    console.log('  devx auth login');
    console.log('');
    process.exit(3);
  }
  
  try {
    const gitContext = resolveGitContext();
    validateGitContext(gitContext);
    
    let rangeValue: string | undefined = undefined;
    if (options.range === true || options.range === '' || options.range === 'auto') {
      const defaultBranch = detectDefaultBranch(gitContext.repoRoot);
      rangeValue = `origin/${defaultBranch}..HEAD`;
    } else if (typeof options.range === 'string') {
      rangeValue = options.range;
    }
    
    const diffOptions = getScanModeFromOptions({
      staged: options.staged,
      commit: options.commit,
      range: rangeValue,
      file: options.file,
    });
    
    const scanMode = diffOptions.mode as 'working' | 'staged' | 'commit' | 'range';
    const baseRef = diffOptions.baseRef;
    const headRef = diffOptions.headRef || gitContext.headSha;
    
    if (!options.all && !options.file) {
      const preflight = runPreflight(gitContext.repoRoot, scanMode, {
        baseRef,
        headRef,
        commitSha: diffOptions.commitSha,
      });
      
      if (!preflight.hasRelevantChanges) {
        if (!options.quiet) {
          console.log(renderNoFilesMessage(preflight.reason || 'No relevant changes detected.'));
        }
        process.exit(0);
      }
    }
    
    const diffHash = options.all ? 'all-files' : getDiffHash(gitContext.repoRoot, scanMode, {
      baseRef,
      headRef,
      commitSha: diffOptions.commitSha,
    });
    
    const useAsync = options.async !== false && !options.sync && process.stdout.isTTY;
    const timeoutMs = options.timeout ? options.timeout * 1000 : (useAsync ? 800 : 30000);
    
    if (!options.noCache) {
      const cacheKey = computeCacheKey({
        remoteUrl: gitContext.remoteUrl,
        mode: scanMode,
        diffHash,
      });
      
      const cached = getCacheEntry(cacheKey);
      
      if (cached) {
        const elapsed = Date.now() - startTime;
        
        if (options.refreshCacheOnly) {
          process.exit(0);
        }
        
        if (!options.quiet) {
          console.log(renderCachedMessage(cached.response.decision, elapsed));
        }
        
        if (useAsync && !options.refreshCacheOnly) {
          const refreshArgs = process.argv.slice(2).filter(arg => 
            !arg.includes('--async') && !arg.includes('--refresh-cache-only')
          );
          startBackgroundRefresh(refreshArgs);
        }
        
        outputResults(cached.response, options);
        exitWithDecision(cached.response);
      }
    }
    
    if (!options.quiet && !options.refreshCacheOnly) {
      console.log('');
      console.log('CloudVerse DevX — Scanning...');
    }
    
    let files: FileEntry[] = [];
    
    if (options.all) {
      files = collectAllFiles(gitContext.repoRoot);
      
      if (files.length === 0) {
        if (!options.quiet) {
          console.log('');
          console.log(renderNoFilesMessage('No scannable files found in repository.'));
          console.log('');
        }
        process.exit(0);
      }
      
      if (!options.quiet && files.length >= 50) {
        console.log('  Note: Scan limited to 50 files (2MB max). Use --file for specific files.');
      }
    } else if (diffOptions.singleFile) {
      const file = collectSingleFile(gitContext.repoRoot, diffOptions.singleFile);
      if (!file) {
        if (!options.quiet) {
          console.log('');
          console.log(`  File not found or binary: ${diffOptions.singleFile}`);
          console.log('');
        }
        process.exit(0);
      }
      files = [file];
    } else {
      const unifiedDiff = getUnifiedDiff(gitContext.repoRoot, scanMode, {
        baseRef,
        headRef,
        commitSha: diffOptions.commitSha,
      });
      
      if (unifiedDiff) {
        const config = getConfig();
        
        const analyzePromise = analyze({
          orgId: config.orgId!,
          userId: config.userId!,
          machineId: config.machineId,
          repo: {
            provider: gitContext.provider,
            owner: gitContext.owner,
            name: gitContext.name,
            remoteUrl: gitContext.remoteUrl,
          },
          scan: {
            mode: scanMode,
            baseRef,
            headRef,
          },
          git: {
            branch: gitContext.branch,
            headSha: gitContext.headSha,
          },
          diff: {
            format: 'unified',
            unified: unifiedDiff.diff.unified,
            text: unifiedDiff.diff.text,
            hash: unifiedDiff.diff.hash,
          },
          filesMeta: unifiedDiff.filesMeta,
          client: getClientInfo(),
        });
        
        const result = await analyzeWithTimeout(analyzePromise, timeoutMs);
        
        if (result.timedOut) {
          if (useAsync && !options.noCache) {
            if (!options.quiet) {
              console.log(renderAsyncPendingMessage());
            }
            
            const refreshArgs = process.argv.slice(2).filter(arg => 
              !arg.includes('--async')
            );
            startBackgroundRefresh(refreshArgs);
            
            process.exit(0);
          } else {
            if (!options.quiet) {
              console.log(renderTimeoutMessage());
            }
            process.exit(0);
          }
        }
        
        const response = result.result;
        cacheResult(gitContext.remoteUrl, scanMode, diffHash, response, options.cacheTtl);
        
        if (options.refreshCacheOnly) {
          process.exit(0);
        }
        
        if (!options.quiet) {
          console.log(`  Repository: ${gitContext.owner}/${gitContext.name}`);
          console.log(`  Mode: ${scanMode}, Files: ${unifiedDiff.filesMeta.length}`);
          console.log('');
        }
        
        outputResults(response, options);
        exitWithDecision(response);
      }
      
      files = collectFiles(gitContext.repoRoot, diffOptions);
    }
    
    if (files.length === 0) {
      if (!options.quiet) {
        console.log('');
        console.log(renderNoFilesMessage('No changed files to analyze.'));
        console.log('');
      }
      process.exit(0);
    }
    
    if (!options.quiet) {
      console.log(`  Repository: ${gitContext.owner}/${gitContext.name}`);
      console.log(`  Mode: ${options.all ? 'all' : scanMode}, Files: ${files.length}`);
      console.log('');
    }
    
    const config = getConfig();
    
    const analyzePromise = analyze({
      orgId: config.orgId!,
      userId: config.userId!,
      machineId: config.machineId,
      repo: {
        provider: gitContext.provider,
        owner: gitContext.owner,
        name: gitContext.name,
        remoteUrl: gitContext.remoteUrl,
      },
      scan: {
        mode: scanMode,
        baseRef,
        headRef,
      },
      git: {
        branch: gitContext.branch,
        headSha: gitContext.headSha,
      },
      files: files.map(f => ({
        path: f.path,
        content: f.content,
        sha: f.sha,
      })),
      client: getClientInfo(),
    });
    
    const result = await analyzeWithTimeout(analyzePromise, timeoutMs);
    
    if (result.timedOut) {
      if (useAsync && !options.noCache) {
        if (!options.quiet) {
          console.log(color('DevX (pre-commit) running... results will appear in PR checks. Commit allowed.', COLORS.yellow));
        }
        
        const refreshArgs = process.argv.slice(2).filter(arg => 
          !arg.includes('--async')
        );
        startBackgroundRefresh(refreshArgs);
        
        process.exit(0);
      } else {
        if (!options.quiet) {
          console.log(color('DevX (pre-push) timed out locally. PR checks will enforce policy.', COLORS.yellow));
        }
        process.exit(0);
      }
    }
    
    const response = result.result;
    
    if (!options.noCache) {
      cacheResult(gitContext.remoteUrl, scanMode, diffHash, response, options.cacheTtl);
    }
    
    outputResults(response, options);
    exitWithDecision(response);
    
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.statusCode === 401 || e.statusCode === 403) {
        console.error('');
        console.error('Authentication error. Please run: devx auth login');
        console.error('');
        process.exit(3);
      }
      if (e.statusCode === 429) {
        console.error('');
        console.error('Usage limit exceeded. Please upgrade your plan or wait.');
        console.error('');
        process.exit(3);
      }
      console.error(`API Error: ${e.message}`);
    } else if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

export function createScanCommand(): Command {
  return new Command('scan')
    .description('Analyze local changes for cost impact')
    .argument('[scope]', 'Optional: "all" to scan entire repository')
    .option('--all', 'Scan all files in the repository (not just changes)')
    .option('--staged', 'Analyze staged changes only')
    .option('--commit <sha>', 'Analyze a specific commit')
    .option('--range [base..head]', 'Analyze a commit range (default: origin/main..HEAD)')
    .option('--file <path>', 'Analyze a single file')
    .option('--format <format>', 'Output format: plain, json, sarif', 'plain')
    .option('--out <file>', 'Write output to file')
    .option('--verbose', 'Show full output even when clean')
    .option('--warn', 'Show output when warnings are present')
    .option('--quiet', 'Suppress all output (for scripts)')
    .option('--no-cache', 'Disable local result caching')
    .option('--cache-ttl <seconds>', 'Override cache TTL in seconds', parseInt)
    .option('--async', 'Enable async mode (default for TTY)')
    .option('--sync', 'Force synchronous mode (wait for results)')
    .option('--timeout <seconds>', 'Timeout in seconds for sync mode', parseInt)
    .option('--refresh-cache-only', 'Update cache without output (internal)')
    .action((scope: string | undefined, options: ScanOptions) => {
      if (scope === 'all') {
        options.all = true;
      } else if (scope) {
        console.error(`Unknown scan scope: "${scope}"`);
        console.error('');
        console.error('Usage: devx scan [all] [options]');
        console.error('  devx scan           Scan changed files (working tree)');
        console.error('  devx scan all       Scan all files in repository');
        console.error('  devx scan --staged  Scan staged files only');
        console.error('');
        process.exit(1);
      }
      return scan(options);
    });
}
