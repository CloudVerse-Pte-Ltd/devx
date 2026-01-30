import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { getConfig, saveConfig, getAccessToken } from '../config/store';

function getCliVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

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
  files?: Array<{
    path: string;
    content: string;
    sha?: string;
  }>;
  diff?: {
    format: 'unified';
    unified: number;
    text: string;
    hash: string;
  };
  filesMeta?: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  client: {
    type: 'cli';
    version: string;
    os: string;
  };
}

export interface RebuttalStatusInfo {
  isExpired: boolean;
  isPending: boolean;
  daysUntilExpiry?: number;
  statusLabel: string;
  statusEmoji: string;
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
  fingerprint?: string;
  confidence?: number;
  isTrusted?: boolean;
  rebuttalStatus?: RebuttalStatusInfo;
}

export interface CostAmplifier {
  id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH';
  confidence: 'low' | 'medium' | 'high';
  amplification?: {
    factor_range?: string;
  };
  findingId: string;
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
  costAmplifiers?: CostAmplifier[];
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
      'User-Agent': `devx-cli/${getCliVersion()}`,
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

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
  expiresAt: string;
}

function shouldRefreshToken(): boolean {
  const config = getConfig();
  if (!config.accessToken || !config.tokenExpiresAt) {
    return false;
  }

  const expiresAt = new Date(config.tokenExpiresAt);
  const now = new Date();
  const refreshWindowMs = 7 * 24 * 60 * 60 * 1000;

  return expiresAt.getTime() - now.getTime() < refreshWindowMs;
}

async function refreshTokenIfNeeded(): Promise<boolean> {
  if (!shouldRefreshToken()) {
    return true;
  }

  const config = getConfig();
  if (!config.accessToken) {
    return false;
  }

  try {
    const result = await request<RefreshTokenResponse>(
      'POST',
      '/api/cli/auth/refresh',
      undefined,
      config.accessToken
    );

    if (result.accessToken) {
      config.accessToken = result.accessToken;
      config.tokenExpiresAt = result.expiresAt;
      saveConfig(config);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function startDeviceAuth(): Promise<DeviceAuthStartResponse> {
  const config = getConfig();
  return request<DeviceAuthStartResponse>('POST', '/api/cli/auth/device/start', {
    client: 'devx-cli',
    machineId: config.machineId,
    os: process.platform,
    version: getCliVersion(),
  });
}

export async function pollDeviceAuth(deviceCode: string): Promise<DeviceAuthPollResponse> {
  return request<DeviceAuthPollResponse>('POST', '/api/cli/auth/device/poll', { deviceCode });
}

export async function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  // Skip refresh for CI/CD token-based auth
  if (!process.env.DEVX_TOKEN) {
    await refreshTokenIfNeeded();
  }
  
  const token = getAccessToken();
  if (!token) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  try {
    return await request<AnalyzeResponse>('POST', '/api/cli/analyze', payload, token);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401 && !process.env.DEVX_TOKEN) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        return request<AnalyzeResponse>('POST', '/api/cli/analyze', payload, getAccessToken());
      }
    }
    throw e;
  }
}

async function tryRefreshAndRetry(): Promise<boolean> {
  const config = getConfig();
  if (!config.accessToken) {
    return false;
  }

  try {
    const result = await request<RefreshTokenResponse>(
      'POST',
      '/api/cli/auth/refresh',
      undefined,
      config.accessToken
    );

    if (result.accessToken) {
      config.accessToken = result.accessToken;
      config.tokenExpiresAt = result.expiresAt;
      saveConfig(config);
      return true;
    }
  } catch (e) {
    return false;
  }

  return false;
}

export function getClientInfo(): { type: 'cli'; version: string; os: string } {
  return {
    type: 'cli',
    version: getCliVersion(),
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
  await refreshTokenIfNeeded();
  
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  const machineIdParam = config.machineId ? `?machineId=${config.machineId}` : '';
  
  try {
    return await request<PingResponse>('GET', `/api/cli/ping${machineIdParam}`, undefined, config.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        const newConfig = getConfig();
        return request<PingResponse>('GET', `/api/cli/ping${machineIdParam}`, undefined, newConfig.accessToken);
      }
    }
    throw e;
  }
}

export async function describeContext(payload: any): Promise<any> {
  if (!process.env.DEVX_TOKEN) {
    await refreshTokenIfNeeded();
  }
  const token = getAccessToken();
  if (!token) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }
  return request<any>('POST', '/api/cli/context/describe', payload, token);
}

export interface ResolveContextRequest {
  orgId: string;
  repo: {
    provider: string;
    owner: string;
    name: string;
    remoteUrl: string;
  };
  git: {
    branch: string;
    headSha: string;
  };
  evidence: {
    rootFiles?: Array<{ path: string; content: string }>;
    treePaths?: string[];
  };
  appId?: string;
}

export interface ContextProfile {
  environment: 'prod' | 'staging' | 'dev' | 'unknown';
  workloadType: 'api' | 'batch' | 'stream' | 'unknown';
  trafficBand: 'low' | 'medium' | 'high' | 'unknown';
  scaleBand: 'single' | 'scaled' | 'highly_scaled' | 'unknown';
  signals?: {
    trafficCount: number | null;
    replicaCount: number | null;
  };
}

export interface ResolveContextResponse {
  profile: {
    contextJson: ContextProfile;
    contextHash: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    derivedAt: string;
    expiresAt: string;
    sources: Array<{ type: string; path?: string; confidence: string }>;
  };
  diff: {
    changed: boolean;
    changes: string[];
    previousHash?: string;
    currentHash?: string;
  };
}

export async function resolveContext(payload: ResolveContextRequest): Promise<ResolveContextResponse> {
  if (!process.env.DEVX_TOKEN) {
    await refreshTokenIfNeeded();
  }
  const token = getAccessToken();
  if (!token) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }
  return request<ResolveContextResponse>('POST', '/api/cli/context/resolve', payload, token);
}

export interface AcceptFindingRequest {
  fingerprint: string;
  reason: string;
  scope?: 'line' | 'function' | 'file' | 'resource';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  appId?: string;
  expiresInDays?: number;
  ruleId?: string;
}

export interface IntentionalFindingData {
  id: string;
  fingerprint: string;
  ruleId: string;
  severity: string;
  reason: string;
  author: string;
  appId?: string;
  createdAt: string;
  expiresAt?: string;
  reviewStatus: 'auto' | 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  reviewedAt?: string;
}

export interface AcceptFindingResponse {
  success: boolean;
  intentional?: IntentionalFindingData;
  requiresApproval?: boolean;
}

export async function acceptFinding(params: AcceptFindingRequest): Promise<AcceptFindingResponse> {
  await refreshTokenIfNeeded();
  
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  if (!config.orgId) {
    throw new ApiError('No organization selected. Run: devx auth login', 401);
  }

  try {
    return await request<AcceptFindingResponse>('POST', '/api/v1/devx/noise-control/intentional', {
      fingerprint: params.fingerprint,
      reason: params.reason,
      scope: params.scope || 'line',
      severity: params.severity,
      appId: params.appId,
      expiresInDays: params.expiresInDays,
      ruleId: params.ruleId,
    }, config.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        const newConfig = getConfig();
        return request<AcceptFindingResponse>('POST', '/api/v1/devx/noise-control/intentional', {
          fingerprint: params.fingerprint,
          reason: params.reason,
          scope: params.scope || 'line',
          severity: params.severity,
          appId: params.appId,
          expiresInDays: params.expiresInDays,
          ruleId: params.ruleId,
        }, newConfig.accessToken);
      }
    }
    throw e;
  }
}

export interface ListRebuttalsResponse {
  intentionals: IntentionalFindingData[];
}

export async function listRebuttals(options?: { pending?: boolean; appId?: string }): Promise<ListRebuttalsResponse> {
  await refreshTokenIfNeeded();
  
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  const params = new URLSearchParams();
  if (options?.pending) params.append('pending', 'true');
  if (options?.appId) params.append('appId', options.appId);

  const queryString = params.toString() ? `?${params.toString()}` : '';
  
  try {
    return await request<ListRebuttalsResponse>('GET', `/api/v1/devx/noise-control/intentional${queryString}`, undefined, config.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        const newConfig = getConfig();
        return request<ListRebuttalsResponse>('GET', `/api/v1/devx/noise-control/intentional${queryString}`, undefined, newConfig.accessToken);
      }
    }
    throw e;
  }
}

export interface ApproveRejectResponse {
  success: boolean;
  intentional?: IntentionalFindingData;
}

export async function approveRebuttal(id: string): Promise<ApproveRejectResponse> {
  await refreshTokenIfNeeded();
  
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  try {
    return await request<ApproveRejectResponse>('POST', `/api/v1/devx/noise-control/intentional/${id}/approve`, {}, config.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        const newConfig = getConfig();
        return request<ApproveRejectResponse>('POST', `/api/v1/devx/noise-control/intentional/${id}/approve`, {}, newConfig.accessToken);
      }
    }
    throw e;
  }
}

export async function rejectRebuttal(id: string): Promise<ApproveRejectResponse> {
  await refreshTokenIfNeeded();
  
  const config = getConfig();
  if (!config.accessToken) {
    throw new ApiError('Not authenticated. Run: devx auth login', 401);
  }

  try {
    return await request<ApproveRejectResponse>('POST', `/api/v1/devx/noise-control/intentional/${id}/reject`, {}, config.accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 401) {
      const refreshed = await tryRefreshAndRetry();
      if (refreshed) {
        const newConfig = getConfig();
        return request<ApproveRejectResponse>('POST', `/api/v1/devx/noise-control/intentional/${id}/reject`, {}, newConfig.accessToken);
      }
    }
    throw e;
  }
}
