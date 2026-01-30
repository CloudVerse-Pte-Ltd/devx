import * as vscode from 'vscode';
import { exec, spawn, ChildProcess } from 'child_process';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem;
let mcpProcess: ChildProcess | null = null;
let projectSummaryCache: any = null;

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('devx');
    
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'devx.showProjectSummary';
    statusBarItem.text = '$(cloud) DevX';
    statusBarItem.tooltip = 'DevX Cost Analysis - Click for project summary';
    statusBarItem.show();
    
    // Scan on Save
    const onSave = vscode.workspace.onDidSaveTextDocument((document) => {
        if (isSupportedLanguage(document.languageId)) {
            runDevxScan(document, diagnosticCollection);
        }
    });

    // Scan current file command
    const scanCommand = vscode.commands.registerCommand('devx.scan', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "DevX: Scanning file for cost optimizations...",
                cancellable: false
            }, async () => {
                await runDevxScan(editor.document, diagnosticCollection);
            });
        }
    });

    // Scan entire project command
    const scanProjectCommand = vscode.commands.registerCommand('devx.scanProject', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "DevX: Scanning project for cost optimizations...",
            cancellable: false
        }, async () => {
            await runProjectScan();
        });
    });

    // Show project summary command
    const showSummaryCommand = vscode.commands.registerCommand('devx.showProjectSummary', async () => {
        await showProjectSummary();
    });

    // Refresh project summary command
    const refreshSummaryCommand = vscode.commands.registerCommand('devx.refreshSummary', async () => {
        projectSummaryCache = null;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "DevX: Refreshing project summary...",
            cancellable: false
        }, async () => {
            await runProjectScan();
            await showProjectSummary();
        });
    });

    // Initialize MCP server in background for faster responses
    initializeMcpServer();

    context.subscriptions.push(
        onSave, 
        scanCommand, 
        scanProjectCommand,
        showSummaryCommand,
        refreshSummaryCommand,
        diagnosticCollection,
        statusBarItem
    );

    // Initial project scan on activation
    setTimeout(() => {
        runProjectScan().then(() => {
            updateStatusBar();
        });
    }, 2000);
}

export function deactivate() {
    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
    }
}

function isSupportedLanguage(langId: string): boolean {
    return ['typescript', 'javascript', 'python', 'go', 'terraform', 'yaml', 'json', 'java', 'dockerfile'].includes(langId);
}

function initializeMcpServer(): void {
    // Start MCP server in background for stateful operations
    try {
        mcpProcess = spawn('devx', ['mcp'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        mcpProcess.on('error', (err) => {
            console.log('DevX MCP server not available, using direct CLI calls');
            mcpProcess = null;
        });

        mcpProcess.on('exit', () => {
            mcpProcess = null;
        });
    } catch (e) {
        console.log('DevX MCP server initialization skipped');
    }
}

async function sendMcpRequest(method: string, params?: any): Promise<any> {
    const proc = mcpProcess;
    if (!proc || !proc.stdin || !proc.stdout) {
        return null;
    }

    const stdout = proc.stdout;
    const stdin = proc.stdin;

    return new Promise((resolve) => {
        const id = Date.now();
        const request = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
        }) + '\n';

        let responseData = '';
        const onData = (data: Buffer) => {
            responseData += data.toString();
            try {
                const response = JSON.parse(responseData);
                if (response.id === id) {
                    stdout.off('data', onData);
                    resolve(response.result);
                }
            } catch (e) {
                // Wait for more data
            }
        };

        stdout.on('data', onData);
        stdin.write(request);

        // Timeout after 5 seconds
        setTimeout(() => {
            stdout.off('data', onData);
            resolve(null);
        }, 5000);
    });
}

function runDevxScan(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): Promise<void> {
    return new Promise((resolve) => {
        const filePath = document.fileName;
        
        // Use the local CLI 'scan' command with --json output
        // The CLI handles deterministic caching and token refresh internally
        const command = `devx scan --file "${filePath}" --format json`;
        
        exec(command, (error, stdout, stderr) => {
            if (error && !stdout) {
                console.error(`DevX CLI Error: ${stderr}`);
                resolve();
                return;
            }

            try {
                const results = JSON.parse(stdout);
                const diagnostics: vscode.Diagnostic[] = (results.findings || []).map((f: any) => {
                    const line = Math.max(0, (f.line || 1) - 1);
                    const endLine = f.endLine ? Math.max(0, f.endLine - 1) : line;
                    const range = new vscode.Range(
                        line, 0,
                        endLine, 200
                    );
                    
                    const impactText = f.costImpact ? ` (Est. Impact: ${f.costImpact})` : '';
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `[DevX] ${f.title || f.message}${impactText}`,
                        getSeverity(f.severity)
                    );
                    diagnostic.code = f.ruleId;
                    diagnostic.source = 'DevX CostLint';
                    return diagnostic;
                });
                
                collection.set(document.uri, diagnostics);
                
                // Update cache with file results
                if (projectSummaryCache) {
                    projectSummaryCache.lastScannedFile = path.basename(filePath);
                    projectSummaryCache.lastScanTime = new Date().toISOString();
                }
                
                updateStatusBar();
            } catch (e) {
                console.error('Failed to parse DevX CLI output');
            }
            resolve();
        });
    });
}

function getSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity?.toLowerCase()) {
        case 'critical':
        case 'high':
            return vscode.DiagnosticSeverity.Error;
        case 'medium':
            return vscode.DiagnosticSeverity.Warning;
        case 'low':
        case 'info':
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

async function runProjectScan(): Promise<void> {
    return new Promise((resolve) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            resolve();
            return;
        }

        const command = `devx scan --format json`;
        
        exec(command, { cwd: workspaceFolder, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && !stdout) {
                console.error(`DevX Project Scan Error: ${stderr}`);
                resolve();
                return;
            }

            try {
                const results = JSON.parse(stdout);
                projectSummaryCache = {
                    findingsCount: results.findings?.length || 0,
                    filesAnalyzed: results.summary?.filesAnalyzed || 0,
                    totalEstimatedImpact: results.summary?.estimatedImpact || '$0/mo',
                    decision: results.decision || 'pass',
                    bySeverity: {
                        high: results.findings?.filter((f: any) => f.severity === 'high').length || 0,
                        medium: results.findings?.filter((f: any) => f.severity === 'medium').length || 0,
                        low: results.findings?.filter((f: any) => f.severity === 'low').length || 0,
                    },
                    lastScanTime: new Date().toISOString(),
                    projectRoot: workspaceFolder
                };
                
                updateStatusBar();
            } catch (e) {
                console.error('Failed to parse DevX project scan output');
            }
            resolve();
        });
    });
}

function updateStatusBar(): void {
    if (!projectSummaryCache) {
        statusBarItem.text = '$(cloud) DevX';
        statusBarItem.tooltip = 'DevX Cost Analysis - Click for project summary';
        return;
    }

    const { findingsCount, bySeverity, totalEstimatedImpact } = projectSummaryCache;
    
    if (findingsCount === 0) {
        statusBarItem.text = '$(check) DevX: Clean';
        statusBarItem.backgroundColor = undefined;
    } else if (bySeverity.high > 0) {
        statusBarItem.text = `$(error) DevX: ${findingsCount} issues`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
        statusBarItem.text = `$(warning) DevX: ${findingsCount} issues`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    
    statusBarItem.tooltip = `DevX Cost Analysis
━━━━━━━━━━━━━━━━━━━━
Findings: ${findingsCount}
  High: ${bySeverity.high}
  Medium: ${bySeverity.medium}
  Low: ${bySeverity.low}
Est. Impact: ${totalEstimatedImpact}
━━━━━━━━━━━━━━━━━━━━
Click for full summary`;
}

async function showProjectSummary(): Promise<void> {
    if (!projectSummaryCache) {
        await runProjectScan();
    }

    if (!projectSummaryCache) {
        vscode.window.showInformationMessage('DevX: No project summary available. Run a scan first.');
        return;
    }

    const { findingsCount, filesAnalyzed, totalEstimatedImpact, bySeverity, lastScanTime, decision } = projectSummaryCache;
    
    const panel = vscode.window.createWebviewPanel(
        'devxSummary',
        'DevX Project Cost Summary',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const statusIcon = decision === 'pass' ? '✅' : decision === 'block' ? '🚫' : '⚠️';
    const statusColor = decision === 'pass' ? '#22c55e' : decision === 'block' ? '#ef4444' : '#f59e0b';

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevX Project Summary</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .status-badge {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 14px;
            font-weight: 600;
            background: ${statusColor}20;
            color: ${statusColor};
        }
        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
        }
        .card-title {
            font-size: 12px;
            text-transform: uppercase;
            opacity: 0.7;
            margin-bottom: 8px;
        }
        .card-value {
            font-size: 28px;
            font-weight: 600;
        }
        .severity-bar {
            display: flex;
            gap: 4px;
            margin-top: 16px;
        }
        .severity-segment {
            height: 8px;
            border-radius: 4px;
        }
        .high { background: #ef4444; }
        .medium { background: #f59e0b; }
        .low { background: #22c55e; }
        .meta {
            font-size: 12px;
            opacity: 0.6;
            margin-top: 24px;
        }
        .refresh-btn {
            margin-top: 16px;
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .refresh-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${statusIcon} DevX Project Summary</h1>
        <span class="status-badge">${decision.toUpperCase()}</span>
    </div>
    
    <div class="cards">
        <div class="card">
            <div class="card-title">Total Findings</div>
            <div class="card-value">${findingsCount}</div>
        </div>
        <div class="card">
            <div class="card-title">Files Analyzed</div>
            <div class="card-value">${filesAnalyzed}</div>
        </div>
        <div class="card">
            <div class="card-title">Est. Monthly Impact</div>
            <div class="card-value">${totalEstimatedImpact}</div>
        </div>
    </div>

    <div class="card">
        <div class="card-title">Findings by Severity</div>
        <div style="display: flex; justify-content: space-between; margin-top: 12px;">
            <span>🔴 High: <strong>${bySeverity.high}</strong></span>
            <span>🟡 Medium: <strong>${bySeverity.medium}</strong></span>
            <span>🟢 Low: <strong>${bySeverity.low}</strong></span>
        </div>
        <div class="severity-bar">
            <div class="severity-segment high" style="flex: ${bySeverity.high || 0.1};"></div>
            <div class="severity-segment medium" style="flex: ${bySeverity.medium || 0.1};"></div>
            <div class="severity-segment low" style="flex: ${bySeverity.low || 0.1};"></div>
        </div>
    </div>

    <div class="meta">
        Last scan: ${new Date(lastScanTime).toLocaleString()}
    </div>
    
    <button class="refresh-btn" onclick="refreshSummary()">Refresh Summary</button>
    
    <script>
        const vscode = acquireVsCodeApi();
        function refreshSummary() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'refresh') {
            await vscode.commands.executeCommand('devx.refreshSummary');
        }
    });
}
