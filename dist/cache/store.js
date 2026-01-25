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
exports.DEFAULT_TTL_RANGE = exports.DEFAULT_TTL_WORKING = void 0;
exports.computeDiffHash = computeDiffHash;
exports.computeCacheKey = computeCacheKey;
exports.getCacheEntry = getCacheEntry;
exports.setCacheEntry = setCacheEntry;
exports.clearCache = clearCache;
exports.cleanExpiredCache = cleanExpiredCache;
exports.getCacheStats = getCacheStats;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const CACHE_DIR = path.join(os.homedir(), '.cloudverse', 'devx', 'cache');
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}
function computeDiffHash(diffText) {
    return crypto.createHash('sha256').update(diffText).digest('hex');
}
function computeCacheKey(params) {
    const keyData = [
        params.remoteUrl,
        params.mode,
        params.diffHash,
        params.policyId || '',
        params.rulesetVersion || '',
    ].join('|');
    return crypto.createHash('sha256').update(keyData).digest('hex');
}
function getCachePath(key) {
    return path.join(CACHE_DIR, `${key}.json`);
}
function getCacheEntry(key) {
    ensureCacheDir();
    const cachePath = getCachePath(key);
    if (!fs.existsSync(cachePath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(cachePath, 'utf-8');
        const entry = JSON.parse(content);
        if (new Date(entry.expiresAt) < new Date()) {
            fs.unlinkSync(cachePath);
            return null;
        }
        return entry;
    }
    catch {
        return null;
    }
}
function setCacheEntry(key, response, diffHash, ttlSeconds, rulesetVersion) {
    ensureCacheDir();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const entry = {
        key,
        response,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        rulesetVersion,
        diffHash,
    };
    const cachePath = getCachePath(key);
    fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
}
function clearCache() {
    if (fs.existsSync(CACHE_DIR)) {
        const files = fs.readdirSync(CACHE_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(CACHE_DIR, file));
            }
        }
    }
}
function cleanExpiredCache() {
    ensureCacheDir();
    let cleaned = 0;
    const files = fs.readdirSync(CACHE_DIR);
    const now = new Date();
    for (const file of files) {
        if (!file.endsWith('.json'))
            continue;
        const filePath = path.join(CACHE_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const entry = JSON.parse(content);
            if (new Date(entry.expiresAt) < now) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        }
        catch {
            fs.unlinkSync(filePath);
            cleaned++;
        }
    }
    return cleaned;
}
function getCacheStats() {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    let sizeBytes = 0;
    let entries = 0;
    for (const file of files) {
        if (!file.endsWith('.json'))
            continue;
        const filePath = path.join(CACHE_DIR, file);
        try {
            const stats = fs.statSync(filePath);
            sizeBytes += stats.size;
            entries++;
        }
        catch {
            // Skip
        }
    }
    return { entries, sizeBytes };
}
exports.DEFAULT_TTL_WORKING = 600;
exports.DEFAULT_TTL_RANGE = 3600;
//# sourceMappingURL=store.js.map