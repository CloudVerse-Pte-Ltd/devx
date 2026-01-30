import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { resolveContext, getClientInfo } from '../api/client';
import { getConfig, isAuthenticated } from '../config/store';
import { resolveGitContext } from '../git/resolve';
import { getContextFromCache, saveContextToCache, clearContextCache } from '../cache/context-cache';

const ALLOWED_EVIDENCE_FILES = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 
  'build.gradle', 'Dockerfile', 'docker-compose.yml', 'Chart.yaml', 'README.md'
];

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

async function collectEvidence(deep: boolean): Promise<{ rootFiles: any[]; treePaths: string[] }> {
  const rootFiles: any[] = [];
  const root = process.cwd();

  for (const file of ALLOWED_EVIDENCE_FILES) {
    const filePath = path.join(root, file);
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < 50000) {
          rootFiles.push({
            path: file,
            content: fs.readFileSync(filePath, 'utf-8')
          });
        }
      } catch {}
    }
  }

  let treePaths: string[] = [];
  if (deep) {
    try {
      const output = execSync('git ls-files', { encoding: 'utf-8' });
      treePaths = output.split('\n').filter(p => !!p).slice(0, 5000);
    } catch {}
  }

  return { rootFiles, treePaths };
}

async function contextAction(options: { json?: boolean; deep?: boolean; verbose?: boolean }): Promise<void> {
  if (!isAuthenticated()) {
    console.error('Not authenticated. Run: devx auth login');
    process.exit(1);
  }

  const config = getConfig();
  const gitCtx = resolveGitContext();

  const cached = getContextFromCache(config.orgId!, gitCtx.remoteUrl);

  if (cached && !options.verbose) {
    const ctx = cached.profile.contextJson;
    
    if (options.json) {
      console.log(JSON.stringify({
        ...ctx,
        confidence: cached.profile.confidence,
        derivedAt: cached.profile.derivedAt,
        expiresAt: cached.profile.expiresAt,
        cached: true,
      }, null, 2));
      return;
    }

    console.log(color('DevX Context Profile', COLORS.bold));
    console.log(`${color('Environment:', COLORS.bold)} ${ctx.environment}`);
    console.log(`${color('Workload:', COLORS.bold)} ${ctx.workloadType}`);
    console.log(`${color('Traffic:', COLORS.bold)} ${ctx.trafficBand}`);
    console.log(`${color('Scale:', COLORS.bold)} ${ctx.scaleBand}`);
    console.log(`${color('Confidence:', COLORS.bold)} ${cached.profile.confidence}`);
    console.log(`${color('Last updated:', COLORS.dim)} ${new Date(cached.profile.derivedAt).toLocaleDateString()}`);
    console.log(color('(cached)', COLORS.dim));
    return;
  }

  const evidence = await collectEvidence(!!options.deep);

  const payload = {
    orgId: config.orgId!,
    repo: {
      provider: gitCtx.provider,
      owner: gitCtx.owner,
      name: gitCtx.name,
      remoteUrl: gitCtx.remoteUrl
    },
    git: {
      branch: gitCtx.branch,
      headSha: gitCtx.headSha
    },
    evidence,
  };

  try {
    const result = await resolveContext(payload);

    saveContextToCache(config.orgId!, gitCtx.remoteUrl, result.profile);

    const ctx = result.profile.contextJson;

    if (options.json) {
      console.log(JSON.stringify({
        ...ctx,
        confidence: result.profile.confidence,
        derivedAt: result.profile.derivedAt,
        expiresAt: result.profile.expiresAt,
        diff: result.diff,
      }, null, 2));
      return;
    }

    console.log(color('DevX Context Profile', COLORS.bold));
    console.log(`${color('Environment:', COLORS.bold)} ${ctx.environment}`);
    console.log(`${color('Workload:', COLORS.bold)} ${ctx.workloadType}`);
    console.log(`${color('Traffic:', COLORS.bold)} ${ctx.trafficBand}`);
    console.log(`${color('Scale:', COLORS.bold)} ${ctx.scaleBand}`);
    console.log(`${color('Confidence:', COLORS.bold)} ${result.profile.confidence}`);
    console.log(`${color('Last updated:', COLORS.dim)} ${new Date(result.profile.derivedAt).toLocaleDateString()}`);

    if (result.diff.changed) {
      console.log('');
      console.log(color('Context changed:', COLORS.yellow));
      for (const change of result.diff.changes) {
        console.log(`  • ${change}`);
      }
    }

    if (options.verbose && result.profile.sources.length > 0) {
      console.log('');
      console.log(color('Evidence sources:', COLORS.dim));
      for (const src of result.profile.sources) {
        console.log(`  • ${src.type}${src.path ? `: ${src.path}` : ''} (${src.confidence})`);
      }
    }
  } catch (error: any) {
    console.error(`Failed to resolve context: ${error.message}`);
    process.exit(1);
  }
}

async function refreshAction(): Promise<void> {
  if (!isAuthenticated()) {
    console.error('Not authenticated. Run: devx auth login');
    process.exit(1);
  }

  const config = getConfig();
  const gitCtx = resolveGitContext();

  clearContextCache(config.orgId!, gitCtx.remoteUrl);

  console.log('Cache cleared. Fetching fresh context...');
  await contextAction({ deep: true, verbose: false });
}

export function createContextCommand(): Command {
  const cmd = new Command('context')
    .description('View or refresh the repository context profile')
    .option('--json', 'Output as JSON')
    .option('--deep', 'Include file tree paths for deeper analysis')
    .option('--verbose', 'Show evidence sources')
    .action(contextAction);

  cmd.command('refresh')
    .description('Force refresh the context profile from server')
    .action(refreshAction);

  return cmd;
}
