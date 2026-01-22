import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { isAuthenticated } from '../config/store';

function requireAuth(): void {
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
}

const HOOK_MARKER = '# CloudVerse DevX hook (managed)';
const HOOK_MARKER_START = '# >>> CloudVerse DevX Start';
const HOOK_MARKER_END = '# <<< CloudVerse DevX End';

const PRE_COMMIT_HOOK = `${HOOK_MARKER}
${HOOK_MARKER_START}
devx scan --staged --quiet --warn 2>/dev/null
DEVX_EXIT=$?
if [ $DEVX_EXIT -eq 2 ]; then
  echo "DevX: block-level cost signals detected. Run \`devx scan --staged\` for details."
  exit 1
elif [ $DEVX_EXIT -eq 1 ]; then
  echo "DevX: cost signals detected (warn-only). Run \`devx scan --staged\` for details."
fi
${HOOK_MARKER_END}`;

const PRE_PUSH_HOOK = `${HOOK_MARKER}
${HOOK_MARKER_START}
DEFAULT_BRANCH="main"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  DEFAULT_BRANCH="main"
elif git rev-parse --verify origin/master >/dev/null 2>&1; then
  DEFAULT_BRANCH="master"
fi
devx scan --range "origin/$DEFAULT_BRANCH..HEAD"
DEVX_EXIT=$?
if [ $DEVX_EXIT -eq 2 ]; then
  exit 1
fi
${HOOK_MARKER_END}`;

function getGitHooksDir(): string {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
    return path.join(gitDir, 'hooks');
  } catch {
    throw new Error('Not in a git repository');
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

function installHooks(): void {
  requireAuth();
  
  try {
    const hooksDir = getGitHooksDir();
    
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }
    
    console.log('');
    console.log('Installing DevX git hooks...');
    
    installHook(hooksDir, 'pre-commit', PRE_COMMIT_HOOK);
    console.log('  ✓ pre-commit hook installed');
    
    installHook(hooksDir, 'pre-push', PRE_PUSH_HOOK);
    console.log('  ✓ pre-push hook installed');
    
    console.log('');
    console.log('Hooks installed successfully!');
    console.log('');
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
    console.log(`pre-push:   ${prePushManaged ? '✓ Installed (managed by DevX)' : prePushExists ? '⚠ Exists (not managed)' : '✗ Not installed'}`);
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

export function createHooksCommand(): Command {
  const hooks = new Command('hooks')
    .description('Manage DevX git hooks');
  
  hooks.command('install')
    .description('Install DevX git hooks (pre-commit, pre-push)')
    .action(installHooks);
  
  hooks.command('uninstall')
    .description('Remove DevX git hooks')
    .action(uninstallHooks);
  
  hooks.command('status')
    .description('Show hook installation status')
    .action(hooksStatus);
  
  return hooks;
}

export function createInstallHooksCommand(): Command {
  return new Command('install-hooks')
    .description('Install DevX git hooks (pre-commit, pre-push)')
    .action(installHooks);
}

export function createUninstallHooksCommand(): Command {
  return new Command('uninstall-hooks')
    .description('Remove DevX git hooks')
    .action(uninstallHooks);
}
