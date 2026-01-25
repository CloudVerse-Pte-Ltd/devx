"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMcpServer = startMcpServer;
const readline_1 = require("readline");
const client_1 = require("../api/client");
const store_1 = require("../config/store");
const resolve_1 = require("../git/resolve");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TOOLS = [
    {
        name: 'costlint_scan',
        description: 'Analyze code for cloud cost optimization opportunities. Returns findings with severity, estimated cost impact, and remediation suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'The source code to analyze for cost optimization opportunities',
                },
                language: {
                    type: 'string',
                    description: 'Programming language (typescript, javascript, python, go, java, terraform, yaml)',
                    enum: ['typescript', 'javascript', 'python', 'go', 'java', 'terraform', 'yaml', 'json'],
                },
                filename: {
                    type: 'string',
                    description: 'Optional filename for better context in analysis',
                },
            },
            required: ['code'],
        },
    },
    {
        name: 'costlint_explain',
        description: 'Get detailed explanation of a CostLint rule including its purpose, impact, and remediation guidance.',
        inputSchema: {
            type: 'object',
            properties: {
                ruleId: {
                    type: 'string',
                    description: 'The CostLint rule ID to explain (e.g., CODE-001, IAC-AWS-001)',
                },
            },
            required: ['ruleId'],
        },
    },
    {
        name: 'costlint_scan_project',
        description: 'Trigger a full project scan. Returns a summary of findings across the entire codebase.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];
const RESOURCES = [
    {
        uri: 'devx://project-summary',
        name: 'DevX Project Cost Summary',
        description: 'Comprehensive summary of all cost optimization findings in the current project.',
        mimeType: 'application/json',
    },
];
// In-memory cache for findings
const findingsCache = new Map();
let projectSummaryCache = null;
function getProjectRoot() {
    let curr = process.cwd();
    while (curr !== path.parse(curr).root) {
        if (fs.existsSync(path.join(curr, 'package.json')) || fs.existsSync(path.join(curr, 'replit.md'))) {
            return curr;
        }
        curr = path.dirname(curr);
    }
    return process.cwd();
}
const PROJECT_ROOT = getProjectRoot();
async function handleCostlintScanProject() {
    // In a real implementation, this would trigger a background scan
    // For now, we simulate project-wide context by returning current workspace status
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    projectRoot: PROJECT_ROOT,
                    status: 'ready',
                    message: 'Project scan capability initialized. Use devx://project-summary resource for latest findings.',
                }, null, 2)
            }]
    };
}
function getVersion() {
    try {
        const fs = require('fs');
        const path = require('path');
        const pkgPath = path.resolve(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '3.1.0';
    }
    catch {
        return '3.1.0';
    }
}
const SERVER_INFO = {
    name: 'devx-costlint',
    version: getVersion(),
    description: 'DevX CostLint MCP Server - Cloud cost optimization analysis',
};
function sendResponse(response) {
    console.log(JSON.stringify(response));
}
function sendError(id, code, message) {
    sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code, message },
    });
}
async function handleCostlintScan(args) {
    const code = args.code;
    const language = args.language || 'unknown';
    const filename = args.filename || getDefaultFilename(language);
    if (!code) {
        return {
            content: [{ type: 'text', text: 'Error: code parameter is required' }],
            isError: true,
        };
    }
    if (!(0, store_1.isAuthenticated)()) {
        return {
            content: [{ type: 'text', text: 'Error: Not authenticated. Run `devx auth login` first.' }],
            isError: true,
        };
    }
    const config = (0, store_1.getConfig)();
    try {
        const pingResult = await (0, client_1.ping)();
        if (!pingResult.cliEnabled) {
            return {
                content: [{ type: 'text', text: 'Error: CLI/MCP access is disabled for this organization.' }],
                isError: true,
            };
        }
        let repoInfo;
        let gitInfo;
        try {
            const ctx = (0, resolve_1.resolveGitContext)();
            repoInfo = { provider: ctx.provider, owner: ctx.owner, name: ctx.name, remoteUrl: ctx.remoteUrl };
            gitInfo = { branch: ctx.branch, headSha: ctx.headSha };
        }
        catch {
            repoInfo = { provider: 'mcp', owner: 'mcp', name: 'inline-scan', remoteUrl: '' };
            gitInfo = { branch: 'main', headSha: 'mcp-scan' };
        }
        const analyzeRequest = {
            orgId: config.orgId,
            userId: config.userId,
            machineId: config.machineId,
            repo: repoInfo,
            scan: { mode: 'staged' },
            git: gitInfo,
            files: [{
                    path: filename,
                    content: code,
                }],
            client: (0, client_1.getClientInfo)(),
        };
        const result = await (0, client_1.analyze)(analyzeRequest);
        if (!result.findings || result.findings.length === 0) {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'clean',
                            message: 'No cost optimization issues found.',
                            filesAnalyzed: result.summary.filesAnalyzed,
                            findingsCount: 0,
                            decision: result.decision,
                        }, null, 2),
                    }],
            };
        }
        const response = {
            status: 'findings',
            findingsCount: result.findings.length,
            decision: result.decision,
            findings: result.findings.map((f) => ({
                ruleId: f.ruleId,
                severity: f.severity,
                title: f.title,
                message: f.message,
                file: f.file,
                line: f.line,
                costImpact: f.costImpact,
                recommendation: f.recommendation,
                autofixAvailable: f.autofixAvailable,
            })),
            summary: {
                high: result.findings.filter((f) => f.severity === 'high').length,
                medium: result.findings.filter((f) => f.severity === 'medium').length,
                low: result.findings.filter((f) => f.severity === 'low').length,
                estimatedImpact: result.summary.estimatedImpact,
            },
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error analyzing code: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}
async function handleCostlintExplain(args) {
    const ruleId = args.ruleId;
    if (!ruleId) {
        return {
            content: [{ type: 'text', text: 'Error: ruleId parameter is required' }],
            isError: true,
        };
    }
    if (!(0, store_1.isAuthenticated)()) {
        return {
            content: [{ type: 'text', text: 'Error: Not authenticated. Run `devx auth login` first.' }],
            isError: true,
        };
    }
    const config = (0, store_1.getConfig)();
    try {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        const baseUrl = new URL(config.apiBaseUrl);
        const fullUrl = new URL(`/api/cli/rules/${ruleId}`, baseUrl);
        const protocol = fullUrl.protocol === 'https:' ? https : http;
        const response = await new Promise((resolve, reject) => {
            const req = protocol.get({
                hostname: fullUrl.hostname,
                port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
                path: fullUrl.pathname,
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'Content-Type': 'application/json',
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            req.on('error', reject);
        });
        if (response.statusCode === 404) {
            return {
                content: [{ type: 'text', text: `Rule not found: ${ruleId}` }],
                isError: true,
            };
        }
        if (response.statusCode !== 200) {
            throw new Error(`API error: ${response.statusCode}`);
        }
        const rule = JSON.parse(response.data);
        return {
            content: [{ type: 'text', text: JSON.stringify(rule, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error fetching rule: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
        };
    }
}
function getDefaultFilename(language) {
    const extensions = {
        typescript: 'code.ts',
        javascript: 'code.js',
        python: 'code.py',
        go: 'code.go',
        java: 'Code.java',
        terraform: 'main.tf',
        yaml: 'config.yaml',
        json: 'config.json',
    };
    return extensions[language.toLowerCase()] || 'code.txt';
}
async function handleRequest(request) {
    const { id, method, params } = request;
    try {
        switch (method) {
            case 'initialize':
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                        },
                        serverInfo: SERVER_INFO,
                    },
                });
                break;
            case 'tools/list':
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result: { tools: TOOLS },
                });
                break;
            case 'resources/list':
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result: { resources: RESOURCES },
                });
                break;
            case 'resources/read':
                const uri = params?.uri || '';
                if (uri === 'devx://project-summary') {
                    sendResponse({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            contents: [{
                                    uri,
                                    mimeType: 'application/json',
                                    text: JSON.stringify(projectSummaryCache || {
                                        message: "No summary available. Run costlint_scan_project first.",
                                        projectRoot: PROJECT_ROOT
                                    }, null, 2)
                                }]
                        }
                    });
                }
                else {
                    sendError(id, -32602, `Resource not found: ${uri}`);
                }
                break;
            case 'tools/call':
                const toolName = params?.name || '';
                const toolArgs = params?.arguments || {};
                let result;
                if (toolName === 'costlint_scan') {
                    result = await handleCostlintScan(toolArgs);
                }
                else if (toolName === 'costlint_explain') {
                    result = await handleCostlintExplain(toolArgs);
                }
                else if (toolName === 'costlint_scan_project') {
                    result = await handleCostlintScanProject();
                }
                else {
                    result = {
                        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
                        isError: true,
                    };
                }
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result,
                });
                break;
            case 'notifications/initialized':
                break;
            case 'resources/subscribe':
            case 'resources/unsubscribe':
                // No-op for now
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result: {},
                });
                break;
            default:
                sendError(id, -32601, `Method not found: ${method}`);
        }
    }
    catch (error) {
        sendError(id, -32603, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function startMcpServer() {
    process.stderr.write(`DevX MCP Server v${SERVER_INFO.version} started\n`);
    const rl = (0, readline_1.createInterface)({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    rl.on('line', async (line) => {
        if (!line.trim())
            return;
        try {
            const request = JSON.parse(line);
            await handleRequest(request);
        }
        catch (error) {
            sendError(null, -32700, 'Parse error');
        }
    });
    rl.on('close', () => {
        process.exit(0);
    });
}
//# sourceMappingURL=server.js.map