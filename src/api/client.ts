import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { getConfig } from '../config/store';

export interface DeviceAuthStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  pollInterval: number;
}

export interface DeviceAuthPollResponse {
  status: 'pending' | 'approved' | 'expired' | 'denied';
  accessToken?: string;
  userId?: string;
  orgId?: string;
  orgName?: string;
  expiresIn?: number;
}

export interface AnalyzeRequest {
  orgId: string;
  userId: string;
  machineId: string;
  repo: {
    provider: string;
    owner: string;
    name: string;
    remoteUrl: string;
  };
  scan: {
    mode: string;
    baseRef?: string;
    headRef?: string;
  };
  git: {
    branch: string;
    headSha: string;
  };
  files: Array<{
    path: string;
    content: string;
    sha?: string;
  }>;
  client: {
    type: 'cli';
    version: string;
    os: string;
  };
}

export interface Finding {
  id: string;
  ruleId: string;
  severity: 'low' | 'medium' | 'high';
  category: 'runtime' | 'provisioning' | 'governance';
  file: string;
  line: number;
  endLine?: number;
  title: string;
  message: string;
  recommendation: string;
  autofixAvailable: boolean;
  costImpact?: string;
}

export interface AnalyzeResponse {
  decision: 'pass' | 'warn' | 'block';
  analysisType: 'code' | 'iac' | 'mixed';
  summary: {
    filesAnalyzed: number;
    codeFiles: number;
    iacFiles: number;
    estimatedImpact?: string;
    baseMonthly?: number;
    headMonthly?: number;
    deltaMonthly?: number;
    explanation: string;
  };
  findings: Finding[];
  policy: {
    blocked: boolean;
    blockReason: string | null;
  };
  usage: {
    unitsConsumed: number;
    unitsRemaining: number;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function request<T>(
  method: string,
  urlPath: string,
  body?: object,
  token?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const config = getConfig();
    const baseUrl = new URL(config.apiBaseUrl);
    const fullUrl = new URL(urlPath, baseUrl);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'devx-cli/1.0.0',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: https.RequestOptions = {
      method,
      hostname: fullUrl.hostname,
      port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      headers,
    };

    const protocol = fullUrl.protocol === 'https:' ? https : http;

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};

          if (res.statusCode && res.statusCode >= 400) {
            const message = parsed.message || parsed.error || `HTTP ${res.statusCode}`;
            reject(new ApiError(message, res.statusCode, parsed.code));
            return;
          }

          resolve(parsed as T);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Network error: ${e.message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

export async function startDeviceAuth(): Promise<DeviceAuthStartResponse> {
  const config = getConfig();
  return request<DeviceAuthStartResponse>('POST', '/api/cli/auth/device/start', {
    client: 'devx-cli',
    machineId: config.machineId,
    os: process.platform,
    version: '1.0.0',
  });
}

export async function pollDeviceAuth(deviceCode: string): Promise<DeviceAuthPollResponse> {
  return request<DeviceAuthPollResponse>('POST', '/api/cli/auth/device/poll', { deviceCode });
}

export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  return request<AnalyzeResponse>('POST', '/api/cli/analyze', payload, config.accessToken);
}

export function getClientInfo(): { type: 'cli'; version: string; os: string } {
  return {
    type: 'cli',
    version: '1.0.0',
    os: process.platform === 'darwin' ? 'darwin' : 'linux',
  };
}

export interface PingResponse {
  ok: boolean;
  serverTime: string;
  orgId: string;
  userId: string;
  machineId?: string;
  cliEnabled: boolean;
}

export async function ping(): Promise<PingResponse> {
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  const machineIdParam = config.machineId ? `?machineId=${config.machineId}` : '';
  return request<PingResponse>('GET', `/api/cli/ping${machineIdParam}`, undefined, config.accessToken);
}
