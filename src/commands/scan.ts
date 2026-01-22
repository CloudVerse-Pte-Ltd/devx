import { Command } from 'commander';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { getConfig, isAuthenticated } from '../config/store';
import { resolveGitContext, validateGitContext } from '../git/resolve';
import { collectFiles, getScanModeFromOptions, collectSingleFile, collectAllFiles } from '../git/diff';
import { analyze, getClientInfo, ApiError, AnalyzeResponse, Finding } from '../api/client';
import { renderTable, renderPlain } from '../output/render';
import { renderSarif } from '../output/sarif';

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

function renderPassMessage(): string {
  return color('  ✓ No cost findings detected.', COLORS.green, COLORS.bold);
}

function renderNoFilesMessage(msg: string): string {
  return color(`  ✓ ${msg}`, COLORS.green);
}

async function scan(options: ScanOptions): Promise<void> {
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
    if (!options.quiet) {
      console.log('');
      console.log('CloudVerse DevX — Scanning...');
    }
    
    const gitContext = resolveGitContext();
    validateGitContext(gitContext);
    
    let rangeValue: string | undefined = undefined;
    if (options.range === true || options.range === '' || options.range === 'auto') {
      const defaultBranch = detectDefaultBranch(gitContext.repoRoot);
      rangeValue = `origin/${defaultBranch}..HEAD`;
    } else if (typeof options.range === 'string') {
      rangeValue = options.range;
    }
    
    let files;
    let scanMode: string;
    let baseRef: string | undefined;
    let headRef: string | undefined;
    
    if (options.all) {
      files = collectAllFiles(gitContext.repoRoot);
      scanMode = 'working';
      headRef = gitContext.headSha;
      
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
    } else {
      const diffOptions = getScanModeFromOptions({
        staged: options.staged,
        commit: options.commit,
        range: rangeValue,
        file: options.file,
      });
      scanMode = diffOptions.mode;
      baseRef = diffOptions.baseRef;
      headRef = diffOptions.headRef || gitContext.headSha;
      
      if (diffOptions.singleFile) {
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
    }
    
    if (!options.quiet) {
      console.log(`  Repository: ${gitContext.owner}/${gitContext.name}`);
      console.log(`  Mode: ${options.all ? 'all' : scanMode}, Files: ${files.length}`);
      console.log('');
    }
    
    const config = getConfig();
    
    const response = await analyze({
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
    
    let output = '';
    
    if (options.format === 'json') {
      output = renderJsonFindings(response);
    } else if (options.format === 'sarif') {
      output = renderSarif(response);
    } else {
      if (options.verbose) {
        output = renderTable(response);
      } else if (response.decision === 'block') {
        output = renderBlockMessage(response);
      } else if (response.decision === 'warn' || hasNonAdvisoryFindings(response)) {
        output = renderWarnMessage(response);
      }
    }
    
    if (options.out) {
      if (options.format === 'json') {
        fs.writeFileSync(options.out, renderJsonFindings(response), 'utf-8');
      } else if (options.format === 'sarif') {
        fs.writeFileSync(options.out, renderSarif(response), 'utf-8');
      } else {
        fs.writeFileSync(options.out, renderPlain(response), 'utf-8');
      }
      if (!options.quiet) {
        console.log(`  Output written to: ${options.out}`);
      }
    } else if (!options.quiet && output) {
      console.log(output);
    } else if (!options.quiet && response.decision === 'pass' && response.findings.length === 0) {
      console.log(renderPassMessage());
      console.log('');
    }
    
    if (response.decision === 'block') {
      process.exit(2);
    }
    
    if (response.decision === 'warn' || hasNonAdvisoryFindings(response)) {
      process.exit(1);
    }
    
    process.exit(0);
    
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
    .action(scan);
}
