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
exports.getConfig = getConfig;
exports.getDefaultConfig = getDefaultConfig;
exports.saveConfig = saveConfig;
exports.clearConfig = clearConfig;
exports.isAuthenticated = isAuthenticated;
exports.getAccessToken = getAccessToken;
exports.getMaskedToken = getMaskedToken;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const CONFIG_DIR = path.join(os.homedir(), '.cloudverse', 'devx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}
function generateMachineId() {
    return crypto.randomUUID();
}
function getConfig() {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return getDefaultConfig();
        }
    }
    return getDefaultConfig();
}
function getDefaultConfig() {
    return {
        apiBaseUrl: 'https://devx.cloudverse.ai',
        defaultBranch: 'main',
        machineId: generateMachineId(),
    };
}
function saveConfig(config) {
    ensureConfigDir();
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_FILE, data, { mode: 0o600 });
}
function clearConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
    }
}
function isAuthenticated() {
    const config = getConfig();
    return !!(config.accessToken && config.orgId && config.userId);
}
function getAccessToken() {
    return getConfig().accessToken;
}
function getMaskedToken(token) {
    if (!token)
        return '(not set)';
    if (token.length <= 8)
        return '****';
    return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}
//# sourceMappingURL=store.js.map