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
exports.getUnifiedDiff = getUnifiedDiff;
exports.getDiffHash = getDiffHash;
const child_process_1 = require("child_process");
const crypto = __importStar(require("crypto"));
const MAX_DIFF_SIZE = 2 * 1024 * 1024;
function exec(cmd, cwd) {
    try {
        return (0, child_process_1.execSync)(cmd, {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
    }
    catch {
        return '';
    }
}
function getUnifiedDiff(repoRoot, mode, options) {
    let diffCmd;
    let statCmd;
    switch (mode) {
        case 'working':
            diffCmd = 'git diff HEAD --unified=3';
            statCmd = 'git diff HEAD --numstat';
            break;
        case 'staged':
            diffCmd = 'git diff --cached --unified=3';
            statCmd = 'git diff --cached --numstat';
            break;
        case 'commit':
            diffCmd = `git diff ${options?.commitSha}^..${options?.commitSha} --unified=3`;
            statCmd = `git diff ${options?.commitSha}^..${options?.commitSha} --numstat`;
            break;
        case 'range':
            diffCmd = `git diff ${options?.baseRef}..${options?.headRef} --unified=3`;
            statCmd = `git diff ${options?.baseRef}..${options?.headRef} --numstat`;
            break;
        default:
            return null;
    }
    const diffText = exec(diffCmd, repoRoot);
    if (!diffText) {
        return null;
    }
    const sizeBytes = Buffer.byteLength(diffText, 'utf-8');
    if (sizeBytes > MAX_DIFF_SIZE) {
        return null;
    }
    const hash = crypto.createHash('sha256').update(diffText).digest('hex');
    const statOutput = exec(statCmd, repoRoot);
    const filesMeta = [];
    if (statOutput) {
        const lines = statOutput.split('\n').filter(Boolean);
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
                const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
                const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
                const filePath = parts[2];
                let status = 'M';
                if (additions > 0 && deletions === 0) {
                    status = 'A';
                }
                else if (additions === 0 && deletions > 0) {
                    status = 'D';
                }
                filesMeta.push({
                    path: filePath,
                    status,
                    additions,
                    deletions,
                });
            }
        }
    }
    return {
        diff: {
            format: 'unified',
            unified: 3,
            text: diffText,
            hash,
            sizeBytes,
        },
        filesMeta,
    };
}
function getDiffHash(repoRoot, mode, options) {
    const payload = getUnifiedDiff(repoRoot, mode, options);
    if (!payload) {
        return crypto.createHash('sha256').update('empty').digest('hex');
    }
    return payload.diff.hash;
}
//# sourceMappingURL=unified-diff.js.map