"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGitContext = resolveGitContext;
exports.validateGitContext = validateGitContext;
const child_process_1 = require("child_process");
function exec(cmd, cwd) {
    try {
        return (0, child_process_1.execSync)(cmd, {
            cwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
    }
    catch {
        return '';
    }
}
function parseRemoteUrl(url) {
    let provider = 'unknown';
    let owner = '';
    let name = '';
    const sshMatch = url.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    const httpsMatch = url.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
    const match = sshMatch || httpsMatch;
    if (match) {
        const host = match[1].toLowerCase();
        owner = match[2];
        name = match[3].replace(/\.git$/, '');
        if (host.includes('github'))
            provider = 'github';
        else if (host.includes('gitlab'))
            provider = 'gitlab';
        else if (host.includes('azure') || host.includes('visualstudio'))
            provider = 'azure';
        else if (host.includes('bitbucket'))
            provider = 'bitbucket';
    }
    return { provider, owner, name };
}
function resolveDefaultBranch(repoRoot) {
    const refs = ['origin/main', 'origin/master', 'main', 'master'];
    for (const ref of refs) {
        const result = exec(`git rev-parse --verify ${ref}`, repoRoot);
        if (result) {
            return ref.replace('origin/', '');
        }
    }
    return 'main';
}
function resolveGitContext() {
    const repoRoot = exec('git rev-parse --show-toplevel');
    if (!repoRoot) {
        throw new Error('Not inside a git repository. Run this command from within a git project.');
    }
    const remoteUrl = exec('git remote get-url origin', repoRoot);
    if (!remoteUrl) {
        throw new Error('No git remote "origin" configured. Please add a remote.');
    }
    const headSha = exec('git rev-parse HEAD', repoRoot);
    if (!headSha) {
        throw new Error('Cannot resolve HEAD. Make sure you have at least one commit.');
    }
    const branch = exec('git rev-parse --abbrev-ref HEAD', repoRoot) || 'HEAD';
    const { provider, owner, name } = parseRemoteUrl(remoteUrl);
    const defaultBranch = resolveDefaultBranch(repoRoot);
    if (!owner || !name) {
        throw new Error(`Cannot parse repository info from remote URL: ${remoteUrl}`);
    }
    return {
        repoRoot,
        provider,
        owner,
        name,
        remoteUrl,
        branch,
        headSha,
        defaultBranch,
    };
}
function validateGitContext(context) {
    if (!context.repoRoot) {
        throw new Error('Repository root not found');
    }
    if (!context.headSha) {
        throw new Error('HEAD SHA not found');
    }
    if (!context.owner || !context.name) {
        throw new Error('Repository owner/name not resolved');
    }
}
//# sourceMappingURL=resolve.js.map