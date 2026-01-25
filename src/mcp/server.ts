import { createInterface } from 'readline';
import { analyze, AnalyzeRequest, Finding, getClientInfo, ping } from '../api/client';
import { getConfig, isAuthenticated } from '../config/store';
import { resolveGitContext } from '../git/resolve';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

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
];

function getVersion(): string {
  try {
    const fs = require('fs');
    const path = require('path');
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '3.1.0';
  } catch {
    return '3.1.0';
  }
}

const SERVER_INFO = {
  name: 'devx-costlint',
  version: getVersion(),
  description: 'DevX CostLint MCP Server - Cloud cost optimization analysis',
};

function sendResponse(response: JsonRpcResponse): void {
  console.log(JSON.stringify(response));
}

function sendError(id: string | number | null, code: number, message: string): void {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

async function handleCostlintScan(args: Record<string, unknown>): Promise<McpToolResult> {
  const code = args.code as string;
  const language = (args.language as string) || 'unknown';
  const filename = (args.filename as string) || getDefaultFilename(language);

  if (!code) {
    return {
      content: [{ type: 'text', text: 'Error: code parameter is required' }],
      isError: true,
    };
  }

  if (!isAuthenticated()) {
    return {
      content: [{ type: 'text', text: 'Error: Not authenticated. Run `devx auth login` first.' }],
      isError: true,
    };
  }

  const config = getConfig();

  try {
    const pingResult = await ping();
    if (!pingResult.cliEnabled) {
      return {
        content: [{ type: 'text', text: 'Error: CLI/MCP access is disabled for this organization.' }],
        isError: true,
      };
    }

    let repoInfo: { provider: string; owner: string; name: string; remoteUrl: string };
    let gitInfo: { branch: string; headSha: string };

    try {
      const ctx = resolveGitContext();
      repoInfo = { provider: ctx.provider, owner: ctx.owner, name: ctx.name, remoteUrl: ctx.remoteUrl };
      gitInfo = { branch: ctx.branch, headSha: ctx.headSha };
    } catch {
      repoInfo = { provider: 'mcp', owner: 'mcp', name: 'inline-scan', remoteUrl: '' };
      gitInfo = { branch: 'main', headSha: 'mcp-scan' };
    }

    const analyzeRequest: AnalyzeRequest = {
      orgId: config.orgId!,
      userId: config.userId!,
      machineId: config.machineId,
      repo: repoInfo,
      scan: { mode: 'staged' },
      git: gitInfo,
      files: [{
        path: filename,
        content: code,
      }],
      client: getClientInfo(),
    };

    const result = await analyze(analyzeRequest);

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
      findings: result.findings.map((f: Finding) => ({
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
        high: result.findings.filter((f: Finding) => f.severity === 'high').length,
        medium: result.findings.filter((f: Finding) => f.severity === 'medium').length,
        low: result.findings.filter((f: Finding) => f.severity === 'low').length,
        estimatedImpact: result.summary.estimatedImpact,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error analyzing code: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function handleCostlintExplain(args: Record<string, unknown>): Promise<McpToolResult> {
  const ruleId = args.ruleId as string;

  if (!ruleId) {
    return {
      content: [{ type: 'text', text: 'Error: ruleId parameter is required' }],
      isError: true,
    };
  }

  if (!isAuthenticated()) {
    return {
      content: [{ type: 'text', text: 'Error: Not authenticated. Run `devx auth login` first.' }],
      isError: true,
    };
  }

  const config = getConfig();

  try {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    const baseUrl = new URL(config.apiBaseUrl);
    const fullUrl = new URL(`/api/cli/rules/${ruleId}`, baseUrl);

    const protocol = fullUrl.protocol === 'https:' ? https : http;

    const response = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      const req = protocol.get(
        {
          hostname: fullUrl.hostname,
          port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
          path: fullUrl.pathname,
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }
      );
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
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error fetching rule: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

function getDefaultFilename(language: string): string {
  const extensions: Record<string, string> = {
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

async function handleRequest(request: JsonRpcRequest): Promise<void> {
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

      case 'tools/call':
        const toolName = (params?.name as string) || '';
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};

        let result: McpToolResult;

        if (toolName === 'costlint_scan') {
          result = await handleCostlintScan(toolArgs);
        } else if (toolName === 'costlint_explain') {
          result = await handleCostlintExplain(toolArgs);
        } else {
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

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32603, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function startMcpServer(): Promise<void> {
  process.stderr.write(`DevX MCP Server v${SERVER_INFO.version} started\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      await handleRequest(request);
    } catch (error) {
      sendError(null, -32700, 'Parse error');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
