"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScanCommand = createScanCommand;
const commander_1 = require("commander");
const child_process_1 = require("child_process");
const store_1 = require("../config/store");
const resolve_1 = require("../git/resolve");
const diff_1 = require("../git/diff");
const client_1 = require("../api/client");
const sarif_1 = require("../output/sarif");
const preflight_1 = require("../cache/preflight");
const store_2 = require("../cache/store");
const unified_diff_1 = require("../git/unified-diff");
const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    orange: '\x1b[38;5;208m',
};
function color(text, ...codes) {
    if (!process.stdout.isTTY)
        return text;
    return codes.join('') + text + COLORS.reset;
}
function detectDefaultBranch(repoRoot) {
    try {
        (0, child_process_1.execSync)('git rev-parse --verify origin/main', { cwd: repoRoot, stdio: 'pipe' });
        return 'main';
    }
    catch {
        try {
            (0, child_process_1.execSync)('git rev-parse --verify origin/master', { cwd: repoRoot, stdio: 'pipe' });
            return 'master';
        }
        catch {
            return 'main';
        }
    }
}
function hasNonAdvisoryFindings(response) {
    return response.findings.some(f => f.severity === 'medium' || f.severity === 'high');
}
function renderJsonFindings(response) {
    const output = {
        decision: response.decision,
        findings: response.findings.map((f) => ({
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
function renderFindingDetails(finding) {
    const lines = [];
    const severityColors = { high: '🔴', medium: '🟡', low: '🔵' };
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
function renderBlockMessage(response) {
    const lines = [];
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
function renderWarnMessage(response) {
    const lines = [];
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
function renderPassMessage(cached) {
    const suffix = cached ? ' (cached)' : '';
    return color(`  ✓ No cost findings detected.${suffix}`, COLORS.green, COLORS.bold);
}
function renderNoFilesMessage(msg) {
    return color(`  ✓ ${msg}`, COLORS.green);
}
function renderCachedMessage(decision, ms) {
    const timing = ms ? ` ${ms}ms` : '';
    if (decision === 'pass') {
        return color(`DevX: PASS (cached)${timing}`, COLORS.green);
    }
    else if (decision === 'block') {
        return color(`DevX: BLOCK (cached)${timing}`, COLORS.red);
    }
    return color(`DevX: ${decision.toUpperCase()} (cached)${timing}`, COLORS.yellow);
}
function renderAsyncPendingMessage() {
    return color('DevX: analyzing... (will cache)', COLORS.yellow);
}
function renderTimeoutMessage() {
    return color('DevX: analysis pending (timed out locally). PR checks will enforce policy.', COLORS.yellow);
}
function startBackgroundRefresh(args) {
    const child = (0, child_process_1.spawn)(process.execPath, [process.argv[1], ...args, '--sync', '--quiet', '--refresh-cache-only'], {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
}
async function analyzeWithTimeout(promise, timeoutMs) {
    return Promise.race([
        promise.then(result => ({ result, timedOut: false })),
        new Promise(resolve => setTimeout(() => resolve({ result: null, timedOut: true }), timeoutMs)),
    ]);
}
function cacheResult(remoteUrl, mode, diffHash, response, customTtl) {
    const ttl = customTtl || (mode === 'range' ? store_2.DEFAULT_TTL_RANGE : store_2.DEFAULT_TTL_WORKING);
    const cacheKey = (0, store_2.computeCacheKey)({ remoteUrl, mode, diffHash });
    (0, store_2.setCacheEntry)(cacheKey, response, diffHash, ttl);
}
const terminal_1 = require("../output/terminal");
const gating_1 = require("../output/gating");
function mapToGatingFinding(f) {
    return {
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        file: f.file,
        line: f.line,
        message: f.message,
        recommendation: f.recommendation,
        category: f.category || 'governance',
        confidence: f.confidence || 0.9,
    };
}
function outputResults(response, options, mode = 'manual') {
    if (options.format === 'json') {
        console.log(renderJsonFindings(response));
        return;
    }
    if (options.format === 'sarif') {
        console.log((0, sarif_1.renderSarif)(response));
        return;
    }
    const gatingFindings = response.findings.map(mapToGatingFinding);
    const gatingResult = (0, gating_1.applyGatingLogic)(gatingFindings, response.decision, mode);
    const terminalOutput = (0, terminal_1.renderTerminal)(gatingResult, mode);
    if (terminalOutput) {
        console.log(terminalOutput);
    }
    else if (!options.quiet && response.decision === 'pass') {
        console.log(renderPassMessage());
    }
}
function exitWithDecision(response) {
    if (response.decision === 'block') {
        process.exit(2);
    }
    if (response.decision === 'warn' || hasNonAdvisoryFindings(response)) {
        process.exit(1);
    }
    process.exit(0);
}
async function scan(options) {
    const startTime = Date.now();
    if (!(0, store_1.isAuthenticated)()) {
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
        const gitContext = (0, resolve_1.resolveGitContext)();
        (0, resolve_1.validateGitContext)(gitContext);
        let rangeValue = undefined;
        if (options.range === true || options.range === '' || options.range === 'auto') {
            const defaultBranch = detectDefaultBranch(gitContext.repoRoot);
            rangeValue = `origin/${defaultBranch}..HEAD`;
        }
        else if (typeof options.range === 'string') {
            rangeValue = options.range;
        }
        const diffOptions = (0, diff_1.getScanModeFromOptions)({
            staged: options.staged,
            commit: options.commit,
            range: rangeValue,
            file: options.file,
        });
        const scanMode = diffOptions.mode;
        const baseRef = diffOptions.baseRef;
        const headRef = diffOptions.headRef || gitContext.headSha;
        if (!options.all && !options.file) {
            const preflight = (0, preflight_1.runPreflight)(gitContext.repoRoot, scanMode, {
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
        const diffHash = options.all ? 'all-files' : (0, unified_diff_1.getDiffHash)(gitContext.repoRoot, scanMode, {
            baseRef,
            headRef,
            commitSha: diffOptions.commitSha,
        });
        const useAsync = options.async !== false && !options.sync && process.stdout.isTTY;
        const timeoutMs = options.timeout ? options.timeout * 1000 : (useAsync ? 800 : 30000);
        if (!options.noCache) {
            const cacheKey = (0, store_2.computeCacheKey)({
                remoteUrl: gitContext.remoteUrl,
                mode: scanMode,
                diffHash,
            });
            const cached = (0, store_2.getCacheEntry)(cacheKey);
            if (cached) {
                const elapsed = Date.now() - startTime;
                if (options.refreshCacheOnly) {
                    process.exit(0);
                }
                if (!options.quiet) {
                    console.log(renderCachedMessage(cached.response.decision, elapsed));
                }
                if (useAsync && !options.refreshCacheOnly) {
                    const refreshArgs = process.argv.slice(2).filter(arg => !arg.includes('--async') && !arg.includes('--refresh-cache-only'));
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
        let files = [];
        if (options.all) {
            files = (0, diff_1.collectAllFiles)(gitContext.repoRoot);
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
        }
        else if (diffOptions.singleFile) {
            const file = (0, diff_1.collectSingleFile)(gitContext.repoRoot, diffOptions.singleFile);
            if (!file) {
                if (!options.quiet) {
                    console.log('');
                    console.log(`  File not found or binary: ${diffOptions.singleFile}`);
                    console.log('');
                }
                process.exit(0);
            }
            files = [file];
        }
        else {
            const unifiedDiff = (0, unified_diff_1.getUnifiedDiff)(gitContext.repoRoot, scanMode, {
                baseRef,
                headRef,
                commitSha: diffOptions.commitSha,
            });
            if (unifiedDiff) {
                const config = (0, store_1.getConfig)();
                const analyzePromise = (0, client_1.analyze)({
                    orgId: config.orgId,
                    userId: config.userId,
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
                    client: (0, client_1.getClientInfo)(),
                });
                const result = await analyzeWithTimeout(analyzePromise, timeoutMs);
                if (result.timedOut) {
                    if (useAsync && !options.noCache) {
                        if (!options.quiet) {
                            console.log(renderAsyncPendingMessage());
                        }
                        const refreshArgs = process.argv.slice(2).filter(arg => !arg.includes('--async'));
                        startBackgroundRefresh(refreshArgs);
                        process.exit(0);
                    }
                    else {
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
            files = (0, diff_1.collectFiles)(gitContext.repoRoot, diffOptions);
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
        const config = (0, store_1.getConfig)();
        const analyzePromise = (0, client_1.analyze)({
            orgId: config.orgId,
            userId: config.userId,
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
            client: (0, client_1.getClientInfo)(),
        });
        const result = await analyzeWithTimeout(analyzePromise, timeoutMs);
        if (result.timedOut) {
            if (useAsync && !options.noCache) {
                if (!options.quiet) {
                    console.log(color('DevX (pre-commit) running... results will appear in PR checks. Commit allowed.', COLORS.yellow));
                }
                const refreshArgs = process.argv.slice(2).filter(arg => !arg.includes('--async'));
                startBackgroundRefresh(refreshArgs);
                process.exit(0);
            }
            else {
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
    }
    catch (e) {
        if (e instanceof client_1.ApiError) {
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
        }
        else if (e instanceof Error) {
            console.error(`Error: ${e.message}`);
        }
        process.exit(3);
    }
}
function createScanCommand() {
    return new commander_1.Command('scan')
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
        .action((scope, options) => {
        if (scope === 'all') {
            options.all = true;
        }
        else if (scope) {
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
//# sourceMappingURL=scan.js.map