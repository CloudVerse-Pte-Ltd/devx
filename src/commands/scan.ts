import { Command } from 'commander';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { getConfig, isAuthenticated } from '../config/store';
import { resolveGitContext, validateGitContext } from '../git/resolve';
import { collectFiles, getScanModeFromOptions, collectSingleFile } from '../git/diff';
import { analyze, getClientInfo, ApiError, AnalyzeResponse, Finding } from '../api/client';
import { renderTable, renderPlain } from '../output/render';
import { renderSarif } from '../output/sarif';

interface ScanOptions {
  staged?: boolean;
  commit?: string;
  range?: string | boolean;
  file?: string;
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

function renderBlockMessage(response: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('CloudVerse DevX: BLOCKED');
  lines.push('');
  
  const blockingFindings = response.findings.filter(f => f.severity === 'high');
  for (const finding of blockingFindings.slice(0, 5)) {
    lines.push(`  ${finding.severity.toUpperCase()}: ${finding.file}:${finding.line} - ${finding.title}`);
  }
  
  if (blockingFindings.length > 5) {
    lines.push(`  ... and ${blockingFindings.length - 5} more`);
  }
  
  lines.push('');
  lines.push('Fix the findings or bypass with: --no-verify');
  lines.push('');
  
  return lines.join('\n');
}

function renderWarnMessage(response: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('CloudVerse DevX: WARNING');
  lines.push('');
  
  const warnFindings = response.findings.filter(f => f.severity === 'medium' || f.severity === 'high');
  for (const finding of warnFindings.slice(0, 5)) {
    lines.push(`  ${finding.severity.toUpperCase()}: ${finding.file}:${finding.line} - ${finding.title}`);
  }
  
  if (warnFindings.length > 5) {
    lines.push(`  ... and ${warnFindings.length - 5} more`);
  }
  
  lines.push('');
  
  return lines.join('\n');
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
    
    let files;
    
    if (diffOptions.singleFile) {
      const file = collectSingleFile(gitContext.repoRoot, diffOptions.singleFile);
      if (!file) {
        if (options.verbose) {
          console.error(`File not found or binary: ${diffOptions.singleFile}`);
        }
        process.exit(0);
      }
      files = [file];
    } else {
      files = collectFiles(gitContext.repoRoot, diffOptions);
    }
    
    if (files.length === 0) {
      process.exit(0);
    }
    
    if (options.verbose) {
      console.log('');
      console.log(`Scanning ${gitContext.owner}/${gitContext.name} (${diffOptions.mode} mode)...`);
      console.log(`Found ${files.length} file(s) to analyze...`);
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
        mode: diffOptions.mode,
        baseRef: diffOptions.baseRef,
        headRef: diffOptions.headRef || gitContext.headSha,
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
    
    const shouldPrintToConsole = 
      options.verbose || 
      response.decision === 'block' ||
      (options.warn && hasNonAdvisoryFindings(response));
    
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
      } else if (options.warn && hasNonAdvisoryFindings(response)) {
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
      if (options.verbose) {
        console.log(`Output written to: ${options.out}`);
      }
    } else if (shouldPrintToConsole && output) {
      console.log(output);
    } else if (!options.quiet && response.decision === 'pass' && response.findings.length === 0) {
      console.log('');
      console.log('  ✓ No cost findings detected.');
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
    .option('--staged', 'Analyze staged changes only')
    .option('--commit <sha>', 'Analyze a specific commit')
    .option('--range [base..head]', 'Analyze a commit range (default: origin/main..HEAD)')
    .option('--file <path>', 'Analyze a single file')
    .option('--format <format>', 'Output format: plain, json, sarif', 'plain')
    .option('--out <file>', 'Write output to file')
    .option('--verbose', 'Show full output even when clean')
    .option('--warn', 'Show output when warnings are present')
    .option('--quiet', 'Deprecated: use default silent behavior')
    .action(scan);
}
