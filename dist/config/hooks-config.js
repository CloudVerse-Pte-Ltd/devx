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
exports.loadHooksConfig = loadHooksConfig;
exports.saveHooksConfig = saveHooksConfig;
exports.generatePreCommitHook = generatePreCommitHook;
exports.generatePrePushHook = generatePrePushHook;
exports.getDefaultConfig = getDefaultConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const DEFAULT_CONFIG = {
    preCommit: {
        enabled: true,
        format: 'quiet',
        blockOn: 'block',
        showCostImpact: true,
    },
    prePush: {
        enabled: true,
        format: 'summary',
        blockOn: 'block',
        showCostImpact: true,
        compareWith: 'auto',
    },
};
function getGitRoot() {
    try {
        return (0, child_process_1.execSync)('git rev-parse --show-toplevel 2>/dev/null', { encoding: 'utf-8' }).trim();
    }
    catch {
        return null;
    }
}
function loadHooksConfig() {
    const gitRoot = getGitRoot();
    if (!gitRoot) {
        return DEFAULT_CONFIG;
    }
    const configPath = path.join(gitRoot, '.devxrc');
    if (!fs.existsSync(configPath)) {
        return DEFAULT_CONFIG;
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
            preCommit: {
                ...DEFAULT_CONFIG.preCommit,
                ...(parsed.hooks?.preCommit || {}),
            },
            prePush: {
                ...DEFAULT_CONFIG.prePush,
                ...(parsed.hooks?.prePush || {}),
            },
        };
    }
    catch {
        return DEFAULT_CONFIG;
    }
}
function saveHooksConfig(config) {
    const gitRoot = getGitRoot();
    if (!gitRoot) {
        throw new Error('Not in a git repository');
    }
    const configPath = path.join(gitRoot, '.devxrc');
    let existing = {};
    if (fs.existsSync(configPath)) {
        try {
            existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        catch {
            existing = {};
        }
    }
    existing.hooks = {
        preCommit: {
            ...(existing.hooks?.preCommit || {}),
            ...(config.preCommit || {}),
        },
        prePush: {
            ...(existing.hooks?.prePush || {}),
            ...(config.prePush || {}),
        },
    };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
}
function generatePreCommitHook(config) {
    return `# >>> CloudVerse DevX Start
# CloudVerse DevX hook (managed)
devx scan --staged --quiet --warn --async --timeout 1
# <<< CloudVerse DevX End`;
}
function generatePrePushHook(config) {
    return `# >>> CloudVerse DevX Start
# CloudVerse DevX hook (managed)
devx scan --range origin/main..HEAD --quiet --sync --timeout 8
# <<< CloudVerse DevX End`;
}
function getDefaultConfig() {
    return { ...DEFAULT_CONFIG };
}
//# sourceMappingURL=hooks-config.js.map