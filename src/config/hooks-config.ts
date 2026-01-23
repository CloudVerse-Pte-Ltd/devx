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
  return `# >>> CloudVerse DevX Start
# CloudVerse DevX hook (managed)
devx scan --staged --quiet --warn --async --timeout 1
# <<< CloudVerse DevX End`;
}

export function generatePrePushHook(config: HooksConfig): string {
  return `# >>> CloudVerse DevX Start
# CloudVerse DevX hook (managed)
devx scan --range origin/main..HEAD --quiet --sync --timeout 8
# <<< CloudVerse DevX End`;
}

export function getDefaultConfig(): HooksConfig {
  return { ...DEFAULT_CONFIG };
}
