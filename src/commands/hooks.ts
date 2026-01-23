import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { isAuthenticated } from '../config/store';
import { 
  loadHooksConfig, 
  saveHooksConfig, 
  generatePreCommitHook, 
  generatePrePushHook,
  getDefaultConfig,
  HooksConfig 
} from '../config/hooks-config';

function requireAuth(): void {
  if (!isAuthenticated()) {
    console.log('');
    console.log('CloudVerse DevX CLI — Hooks');
    console.log('To continue, authenticate this device.');
    console.log('');
    console.log('Run:');
    console.log('  devx auth login');
    console.log('');
    process.exit(3);
  }
}

const HOOK_MARKER = '# CloudVerse DevX hook (managed)';
const HOOK_MARKER_START = '# >>> CloudVerse DevX Start';
const HOOK_MARKER_END = '# <<< CloudVerse DevX End';

function getGitHooksDir(): string {
  try {
    const gitDir = execSync('git rev-parse --git-dir 2>/dev/null', { encoding: 'utf-8' }).trim();
    return path.join(gitDir, 'hooks');
  } catch {
    throw new Error('Not in a git repository. Git hooks can only be installed inside a git repository.');
  }
}

function hasDevxHook(content: string): boolean {
  return content.includes(HOOK_MARKER) || content.includes(HOOK_MARKER_START);
}

function removeDevxHook(content: string): string {
  const startIdx = content.indexOf(HOOK_MARKER_START);
  const endIdx = content.indexOf(HOOK_MARKER_END);
  
  if (startIdx === -1 || endIdx === -1) {
    return content;
  }
  
  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + HOOK_MARKER_END.length);
  
  return (before + after).replace(/\n{3,}/g, '\n\n').trim();
}

function installHook(hooksDir: string, hookName: string, hookContent: string): boolean {
  const hookPath = path.join(hooksDir, hookName);
  let existingContent = '';
  
  if (fs.existsSync(hookPath)) {
    existingContent = fs.readFileSync(hookPath, 'utf-8');
    
    if (hasDevxHook(existingContent)) {
      existingContent = removeDevxHook(existingContent);
    }
  } else {
    existingContent = '#!/bin/sh\n';
  }
  
  const newContent = existingContent.trimEnd() + '\n\n' + hookContent + '\n';
  
  fs.writeFileSync(hookPath, newContent, { mode: 0o755 });
  return true;
}

function uninstallHook(hooksDir: string, hookName: string): boolean {
  const hookPath = path.join(hooksDir, hookName);
  
  if (!fs.existsSync(hookPath)) {
    return false;
  }
  
  const content = fs.readFileSync(hookPath, 'utf-8');
  
  if (!hasDevxHook(content)) {
    return false;
  }
  
  const newContent = removeDevxHook(content);
  
  if (newContent.trim() === '#!/bin/sh' || newContent.trim() === '') {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, newContent, { mode: 0o755 });
  }
  
  return true;
}

interface InstallOptions {
  format?: 'quiet' | 'summary' | 'full';
  blockOn?: 'block' | 'warn' | 'none';
  preCommit?: boolean;
  prePush?: boolean;
}

function installHooks(options: InstallOptions = {}): void {
  requireAuth();
  
  try {
    const hooksDir = getGitHooksDir();
    
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const config = loadHooksConfig();
    
    if (options.format) {
      config.preCommit.format = options.format;
      config.prePush.format = options.format;
    }
    
    if (options.blockOn) {
      config.preCommit.blockOn = options.blockOn;
      config.prePush.blockOn = options.blockOn;
    }

    if (options.preCommit === false) {
      config.preCommit.enabled = false;
    }
    
    if (options.prePush === false) {
      config.prePush.enabled = false;
    }

    saveHooksConfig(config);
    
    console.log('');
    console.log('Installing DevX git hooks...');

    if (config.preCommit.enabled) {
      const preCommitHook = generatePreCommitHook(config);
      installHook(hooksDir, 'pre-commit', preCommitHook);
      console.log(`  ✓ pre-commit hook installed (format: ${config.preCommit.format}, block-on: ${config.preCommit.blockOn})`);
    } else {
      if (uninstallHook(hooksDir, 'pre-commit')) {
        console.log('  ✓ pre-commit hook removed (disabled)');
      } else {
        console.log('  - pre-commit hook disabled');
      }
    }

    if (config.prePush.enabled) {
      const prePushHook = generatePrePushHook(config);
      installHook(hooksDir, 'pre-push', prePushHook);
      console.log(`  ✓ pre-push hook installed (format: ${config.prePush.format}, block-on: ${config.prePush.blockOn})`);
    } else {
      if (uninstallHook(hooksDir, 'pre-push')) {
        console.log('  ✓ pre-push hook removed (disabled)');
      } else {
        console.log('  - pre-push hook disabled');
      }
    }
    
    console.log('');
    console.log('Hooks installed successfully!');
    console.log('');
    console.log('Configuration saved to .devxrc');
    console.log('DevX will now analyze your changes before commit and push.');
    console.log('To bypass: git commit --no-verify');
    console.log('');
    
  } catch (e) {
    if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

function uninstallHooks(): void {
  try {
    const hooksDir = getGitHooksDir();
    
    console.log('');
    console.log('Uninstalling DevX git hooks...');
    
    if (uninstallHook(hooksDir, 'pre-commit')) {
      console.log('  ✓ pre-commit hook removed');
    } else {
      console.log('  - pre-commit hook not found');
    }
    
    if (uninstallHook(hooksDir, 'pre-push')) {
      console.log('  ✓ pre-push hook removed');
    } else {
      console.log('  - pre-push hook not found');
    }
    
    console.log('');
    console.log('Hooks uninstalled.');
    console.log('');
    
  } catch (e) {
    if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

function hooksStatus(): void {
  try {
    const hooksDir = getGitHooksDir();
    const config = loadHooksConfig();
    
    console.log('');
    console.log('CloudVerse DevX — Hook Status');
    console.log('');
    
    const preCommitPath = path.join(hooksDir, 'pre-commit');
    const prePushPath = path.join(hooksDir, 'pre-push');
    
    const preCommitExists = fs.existsSync(preCommitPath);
    const prePushExists = fs.existsSync(prePushPath);
    
    const preCommitManaged = preCommitExists && hasDevxHook(fs.readFileSync(preCommitPath, 'utf-8'));
    const prePushManaged = prePushExists && hasDevxHook(fs.readFileSync(prePushPath, 'utf-8'));
    
    console.log(`pre-commit: ${preCommitManaged ? '✓ Installed (managed by DevX)' : preCommitExists ? '⚠ Exists (not managed)' : '✗ Not installed'}`);
    if (preCommitManaged) {
      console.log(`            Format: ${config.preCommit.format}, Block on: ${config.preCommit.blockOn}`);
    }
    
    console.log(`pre-push:   ${prePushManaged ? '✓ Installed (managed by DevX)' : prePushExists ? '⚠ Exists (not managed)' : '✗ Not installed'}`);
    if (prePushManaged) {
      console.log(`            Format: ${config.prePush.format}, Block on: ${config.prePush.blockOn}`);
    }
    console.log('');
    
    if (!preCommitManaged || !prePushManaged) {
      console.log('Run `devx hooks install` to install managed hooks.');
      console.log('');
    }
    
  } catch (e) {
    if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

function hooksConfig(): void {
  try {
    const config = loadHooksConfig();
    
    console.log('');
    console.log('CloudVerse DevX — Hooks Configuration');
    console.log('');
    console.log('pre-commit:');
    console.log(`  enabled:         ${config.preCommit.enabled}`);
    console.log(`  format:          ${config.preCommit.format}`);
    console.log(`  block-on:        ${config.preCommit.blockOn}`);
    console.log(`  show-cost-impact: ${config.preCommit.showCostImpact}`);
    console.log('');
    console.log('pre-push:');
    console.log(`  enabled:         ${config.prePush.enabled}`);
    console.log(`  format:          ${config.prePush.format}`);
    console.log(`  block-on:        ${config.prePush.blockOn}`);
    console.log(`  show-cost-impact: ${config.prePush.showCostImpact}`);
    console.log(`  compare-with:    ${config.prePush.compareWith}`);
    console.log('');
    console.log('Configuration is stored in .devxrc');
    console.log('Run `devx hooks install --format <mode>` to change settings.');
    console.log('');
    
  } catch (e) {
    if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

export function createHooksCommand(): Command {
  const hooks = new Command('hooks')
    .description('Manage DevX git hooks');
  
  hooks.command('install')
    .description('Install DevX git hooks (pre-commit, pre-push)')
    .option('--format <mode>', 'Output format: quiet, summary, full', 'quiet')
    .option('--block-on <level>', 'Block commits on: block, warn, none', 'block')
    .option('--no-pre-commit', 'Skip pre-commit hook installation')
    .option('--no-pre-push', 'Skip pre-push hook installation')
    .action((options) => {
      installHooks({
        format: options.format as 'quiet' | 'summary' | 'full',
        blockOn: options.blockOn as 'block' | 'warn' | 'none',
        preCommit: options.preCommit,
        prePush: options.prePush,
      });
    });
  
  hooks.command('uninstall')
    .description('Remove DevX git hooks')
    .action(uninstallHooks);
  
  hooks.command('status')
    .description('Show hook installation status')
    .action(hooksStatus);

  hooks.command('config')
    .description('Show current hooks configuration')
    .action(hooksConfig);
  
  return hooks;
}

export function createInstallHooksCommand(): Command {
  return new Command('install-hooks')
    .description('Install DevX git hooks (pre-commit, pre-push)')
    .option('--format <mode>', 'Output format: quiet, summary, full', 'quiet')
    .option('--block-on <level>', 'Block commits on: block, warn, none', 'block')
    .option('--no-pre-commit', 'Skip pre-commit hook installation')
    .option('--no-pre-push', 'Skip pre-push hook installation')
    .action((options) => {
      installHooks({
        format: options.format as 'quiet' | 'summary' | 'full',
        blockOn: options.blockOn as 'block' | 'warn' | 'none',
        preCommit: options.preCommit,
        prePush: options.prePush,
      });
    });
}

export function createUninstallHooksCommand(): Command {
  return new Command('uninstall-hooks')
    .description('Remove DevX git hooks')
    .action(uninstallHooks);
}
