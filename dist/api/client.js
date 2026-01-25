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
exports.ApiError = void 0;
exports.startDeviceAuth = startDeviceAuth;
exports.pollDeviceAuth = pollDeviceAuth;
exports.analyze = analyze;
exports.getClientInfo = getClientInfo;
exports.ping = ping;
exports.acceptFinding = acceptFinding;
exports.listRebuttals = listRebuttals;
exports.approveRebuttal = approveRebuttal;
exports.rejectRebuttal = rejectRebuttal;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const url_1 = require("url");
const store_1 = require("../config/store");
function getCliVersion() {
    try {
        const pkgPath = path.resolve(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '1.0.0';
    }
    catch {
        return '1.0.0';
    }
}
class ApiError extends Error {
    statusCode;
    code;
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
function request(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const config = (0, store_1.getConfig)();
        const baseUrl = new url_1.URL(config.apiBaseUrl);
        const fullUrl = new url_1.URL(urlPath, baseUrl);
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': `devx-cli/${getCliVersion()}`,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const options = {
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
                    resolve(parsed);
                }
                catch (e) {
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
function shouldRefreshToken() {
    const config = (0, store_1.getConfig)();
    if (!config.accessToken || !config.tokenExpiresAt) {
        return false;
    }
    const expiresAt = new Date(config.tokenExpiresAt);
    const now = new Date();
    const refreshWindowMs = 7 * 24 * 60 * 60 * 1000;
    return expiresAt.getTime() - now.getTime() < refreshWindowMs;
}
async function refreshTokenIfNeeded() {
    if (!shouldRefreshToken()) {
        return true;
    }
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        return false;
    }
    try {
        const result = await request('POST', '/api/cli/auth/refresh', undefined, config.accessToken);
        if (result.accessToken) {
            config.accessToken = result.accessToken;
            config.tokenExpiresAt = result.expiresAt;
            (0, store_1.saveConfig)(config);
            return true;
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
async function startDeviceAuth() {
    const config = (0, store_1.getConfig)();
    return request('POST', '/api/cli/auth/device/start', {
        client: 'devx-cli',
        machineId: config.machineId,
        os: process.platform,
        version: getCliVersion(),
    });
}
async function pollDeviceAuth(deviceCode) {
    return request('POST', '/api/cli/auth/device/poll', { deviceCode });
}
async function analyze(payload) {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    try {
        return await request('POST', '/api/cli/analyze', payload, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('POST', '/api/cli/analyze', payload, newConfig.accessToken);
            }
        }
        throw e;
    }
}
async function tryRefreshAndRetry() {
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        return false;
    }
    try {
        const result = await request('POST', '/api/cli/auth/refresh', undefined, config.accessToken);
        if (result.accessToken) {
            config.accessToken = result.accessToken;
            config.tokenExpiresAt = result.expiresAt;
            (0, store_1.saveConfig)(config);
            return true;
        }
    }
    catch (e) {
        return false;
    }
    return false;
}
function getClientInfo() {
    return {
        type: 'cli',
        version: getCliVersion(),
        os: process.platform === 'darwin' ? 'darwin' : 'linux',
    };
}
async function ping() {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    const machineIdParam = config.machineId ? `?machineId=${config.machineId}` : '';
    try {
        return await request('GET', `/api/cli/ping${machineIdParam}`, undefined, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('GET', `/api/cli/ping${machineIdParam}`, undefined, newConfig.accessToken);
            }
        }
        throw e;
    }
}
async function acceptFinding(params) {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    if (!config.orgId) {
        throw new ApiError('No organization selected. Run: devx auth login', 401);
    }
    try {
        return await request('POST', '/api/v1/devx/noise-control/intentional', {
            fingerprint: params.fingerprint,
            reason: params.reason,
            scope: params.scope || 'line',
            severity: params.severity,
            appId: params.appId,
            expiresInDays: params.expiresInDays,
            ruleId: params.ruleId,
        }, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('POST', '/api/v1/devx/noise-control/intentional', {
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
async function listRebuttals(options) {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    const params = new URLSearchParams();
    if (options?.pending)
        params.append('pending', 'true');
    if (options?.appId)
        params.append('appId', options.appId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    try {
        return await request('GET', `/api/v1/devx/noise-control/intentional${queryString}`, undefined, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('GET', `/api/v1/devx/noise-control/intentional${queryString}`, undefined, newConfig.accessToken);
            }
        }
        throw e;
    }
}
async function approveRebuttal(id) {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    try {
        return await request('POST', `/api/v1/devx/noise-control/intentional/${id}/approve`, {}, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('POST', `/api/v1/devx/noise-control/intentional/${id}/approve`, {}, newConfig.accessToken);
            }
        }
        throw e;
    }
}
async function rejectRebuttal(id) {
    await refreshTokenIfNeeded();
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        throw new ApiError('Not authenticated. Run: devx auth login', 401);
    }
    try {
        return await request('POST', `/api/v1/devx/noise-control/intentional/${id}/reject`, {}, config.accessToken);
    }
    catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) {
            const refreshed = await tryRefreshAndRetry();
            if (refreshed) {
                const newConfig = (0, store_1.getConfig)();
                return request('POST', `/api/v1/devx/noise-control/intentional/${id}/reject`, {}, newConfig.accessToken);
            }
        }
        throw e;
    }
}
//# sourceMappingURL=client.js.map