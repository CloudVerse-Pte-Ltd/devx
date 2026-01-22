import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface HooksConfig {
  preCommit: {
    enabled: boolean;
    format: 'quiet' | 'summary' | 'full';
    blockOn: 'block' | 'warn' | 'none';
    showCostImpact: boolean;
  };
  prePush: {
    enabled: boolean;
    format: 'quiet' | 'summary' | 'full';
    blockOn: 'block' | 'warn' | 'none';
    showCostImpact: boolean;
    compareWith: 'origin/main' | 'origin/master' | 'auto';
  };
}

const DEFAULT_CONFIG: HooksConfig = {
  preCommit: {
    enabled: true,
    format: 'quiet',
    blockOn: 'block',
    showCostImpact: true,
  },
  prePush: {
    enabled: true,
    format: 'summary',
    blockOn: 'block',
    showCostImpact: true,
    compareWith: 'auto',
  },
};

function getGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel 2>/dev/null', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export function loadHooksConfig(): HooksConfig {
  const gitRoot = getGitRoot();
  if (!gitRoot) {
    return DEFAULT_CONFIG;
  }

  const configPath = path.join(gitRoot, '.devxrc');
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    return {
      preCommit: {
        ...DEFAULT_CONFIG.preCommit,
        ...(parsed.hooks?.preCommit || {}),
      },
      prePush: {
        ...DEFAULT_CONFIG.prePush,
        ...(parsed.hooks?.prePush || {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveHooksConfig(config: Partial<HooksConfig>): void {
  const gitRoot = getGitRoot();
  if (!gitRoot) {
    throw new Error('Not in a git repository');
  }

  const configPath = path.join(gitRoot, '.devxrc');
  let existing: any = {};
  
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  existing.hooks = {
    preCommit: {
      ...(existing.hooks?.preCommit || {}),
      ...(config.preCommit || {}),
    },
    prePush: {
      ...(existing.hooks?.prePush || {}),
      ...(config.prePush || {}),
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
}

export function generatePreCommitHook(config: HooksConfig): string {
  const { preCommit } = config;
  
  if (!preCommit.enabled) {
    return '';
  }

  const formatArg = preCommit.format === 'quiet' ? '--quiet' : 
                    preCommit.format === 'summary' ? '' : '--format table';
  
  const costArg = preCommit.showCostImpact ? '' : '--no-cost-impact';
  const warnArg = preCommit.blockOn === 'warn' ? '--warn' : '';
  
  const scanArgs = ['devx scan --staged --async', formatArg, costArg, warnArg]
    .filter(Boolean)
    .join(' ');

  const suppressOutput = preCommit.format === 'quiet' ? ' 2>/dev/null' : '';

  let exitHandling = '';
  if (preCommit.blockOn === 'block') {
    exitHandling = `
if [ $DEVX_EXIT -eq 2 ]; then
  echo "DevX: block-level cost signals detected. Run \\\`devx scan --staged --sync\\\` for details."
  exit 1
elif [ $DEVX_EXIT -eq 1 ]; then
  echo "DevX: cost signals detected (warn-only). Proceeding with commit."
fi`;
  } else if (preCommit.blockOn === 'warn') {
    exitHandling = `
if [ $DEVX_EXIT -ne 0 ]; then
  echo "DevX: cost signals detected. Run \\\`devx scan --staged --sync\\\` for details."
fi`;
  }

  return `# CloudVerse DevX hook (managed)
# >>> CloudVerse DevX Start
${scanArgs}${suppressOutput}
DEVX_EXIT=$?${exitHandling}
# <<< CloudVerse DevX End`;
}

export function generatePrePushHook(config: HooksConfig): string {
  const { prePush } = config;
  
  if (!prePush.enabled) {
    return '';
  }

  const formatArg = prePush.format === 'quiet' ? '--quiet' : 
                    prePush.format === 'summary' ? '' : '--format table';
  
  const costArg = prePush.showCostImpact ? '' : '--no-cost-impact';
  
  let branchDetection = '';
  if (prePush.compareWith === 'auto') {
    branchDetection = `
DEFAULT_BRANCH="main"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  DEFAULT_BRANCH="main"
elif git rev-parse --verify origin/master >/dev/null 2>&1; then
  DEFAULT_BRANCH="master"
fi`;
  } else {
    branchDetection = `
DEFAULT_BRANCH="${prePush.compareWith.replace('origin/', '')}"`;
  }

  const scanArgs = ['devx scan --range "origin/$DEFAULT_BRANCH..HEAD" --sync --timeout 8', formatArg, costArg]
    .filter(Boolean)
    .join(' ');

  const suppressOutput = prePush.format === 'quiet' ? ' 2>/dev/null' : '';

  let exitHandling = '';
  if (prePush.blockOn === 'block') {
    exitHandling = `
if [ $DEVX_EXIT -eq 2 ]; then
  echo "DevX: block-level cost signals detected. Push blocked."
  exit 1
fi`;
  } else if (prePush.blockOn === 'warn') {
    exitHandling = `
if [ $DEVX_EXIT -ne 0 ]; then
  echo "DevX: cost signals detected. Run \\\`devx scan\\\` for details."
fi`;
  }

  return `# CloudVerse DevX hook (managed)
# >>> CloudVerse DevX Start${branchDetection}
${scanArgs}${suppressOutput}
DEVX_EXIT=$?${exitHandling}
# <<< CloudVerse DevX End`;
}

export function getDefaultConfig(): HooksConfig {
  return { ...DEFAULT_CONFIG };
}
