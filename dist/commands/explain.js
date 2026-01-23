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
exports.createExplainCommand = createExplainCommand;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const store_1 = require("../config/store");
const CACHE_DIR = path.join(os.homedir(), '.cloudverse', 'devx', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'rules.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const content = fs.readFileSync(CACHE_FILE, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch (e) {
    }
    return {};
}
function saveCache(cache) {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }
    catch (e) {
    }
}
function getCachedRule(ruleId) {
    const cache = loadCache();
    const entry = cache[ruleId];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.data;
    }
    return null;
}
function setCachedRule(ruleId, data) {
    const cache = loadCache();
    cache[ruleId] = { data, timestamp: Date.now() };
    saveCache(cache);
}
async function fetchRuleExplanation(ruleId) {
    const config = (0, store_1.getConfig)();
    if (!config.accessToken) {
        return null;
    }
    try {
        const https = await Promise.resolve().then(() => __importStar(require('https')));
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        const { URL } = await Promise.resolve().then(() => __importStar(require('url')));
        const baseUrl = new URL(config.apiBaseUrl);
        const fullUrl = new URL(`/api/cli/rules/${encodeURIComponent(ruleId)}`, baseUrl);
        return new Promise((resolve) => {
            const protocol = fullUrl.protocol === 'https:' ? https : http;
            const req = protocol.request({
                method: 'GET',
                hostname: fullUrl.hostname,
                port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
                path: fullUrl.pathname,
                headers: {
                    'Authorization': `Bearer ${config.accessToken}`,
                    'User-Agent': 'devx-cli/1.0.0',
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(data));
                        }
                        catch {
                            resolve(null);
                        }
                    }
                    else {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.end();
        });
    }
    catch {
        return null;
    }
}
function formatExplanation(rule) {
    const lines = [];
    lines.push('');
    lines.push('\x1b[1mCloudVerse DevX — Rule Explain\x1b[0m');
    lines.push('');
    lines.push(`\x1b[1mRule:\x1b[0m ${rule.ruleId} — ${rule.title}`);
    lines.push(`\x1b[1mCategory:\x1b[0m ${rule.category}`);
    lines.push('');
    lines.push('\x1b[1mWhy it matters:\x1b[0m');
    lines.push(rule.whyItMatters);
    lines.push('');
    if (rule.recommendations && rule.recommendations.length > 0) {
        lines.push('\x1b[1mRecommendations:\x1b[0m');
        for (const rec of rule.recommendations) {
            lines.push(`• ${rec}`);
        }
        lines.push('');
    }
    if (rule.examples) {
        if (rule.examples.bad) {
            lines.push('\x1b[1mExample (bad):\x1b[0m');
            lines.push('\x1b[2m' + rule.examples.bad + '\x1b[0m');
            lines.push('');
        }
        if (rule.examples.good) {
            lines.push('\x1b[1mExample (good):\x1b[0m');
            lines.push('\x1b[32m' + rule.examples.good + '\x1b[0m');
            lines.push('');
        }
    }
    if (rule.autofix) {
        const status = rule.autofix.available ? '✓ Available' : '✗ Not available';
        lines.push(`\x1b[1mAutofix:\x1b[0m ${status}`);
        if (rule.autofix.notes) {
            lines.push(`  ${rule.autofix.notes}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
async function explain(ruleId, options) {
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
    let rule = getCachedRule(ruleId);
    if (!rule) {
        rule = await fetchRuleExplanation(ruleId);
        if (rule) {
            setCachedRule(ruleId, rule);
        }
    }
    if (!rule) {
        const cachedRule = getCachedRule(ruleId);
        if (cachedRule) {
            rule = cachedRule;
            console.error('\x1b[33mUsing cached data (API unavailable)\x1b[0m');
        }
        else {
            console.error('');
            console.error(`Rule not found: ${ruleId}`);
            console.error('');
            console.error('Check the rule ID and try again.');
            console.error('');
            process.exit(1);
        }
    }
    if (options.json) {
        console.log(JSON.stringify(rule, null, 2));
    }
    else {
        console.log(formatExplanation(rule));
    }
}
function createExplainCommand() {
    return new commander_1.Command('explain')
        .description('Get detailed explanation for a cost rule')
        .argument('<ruleId>', 'The rule ID to explain (e.g., CODE_CHATTY_API_LOOP)')
        .option('--json', 'Output as JSON')
        .action(explain);
}
//# sourceMappingURL=explain.js.map