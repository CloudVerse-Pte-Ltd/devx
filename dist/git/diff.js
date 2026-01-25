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
exports.collectFiles = collectFiles;
exports.getScanModeFromOptions = getScanModeFromOptions;
exports.collectSingleFile = collectSingleFile;
exports.collectAllFiles = collectAllFiles;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_FILES = 50;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
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
function isBinaryContent(content) {
    return content.includes('\0');
}
function getFileContent(repoRoot, filePath, mode, ref) {
    try {
        let content;
        switch (mode) {
            case 'working': {
                const fullPath = path.join(repoRoot, filePath);
                if (!fs.existsSync(fullPath))
                    return null;
                content = fs.readFileSync(fullPath, 'utf-8');
                break;
            }
            case 'staged': {
                content = exec(`git show :${filePath}`, repoRoot);
                break;
            }
            case 'commit':
            case 'range': {
                const gitRef = ref || 'HEAD';
                content = exec(`git show ${gitRef}:${filePath}`, repoRoot);
                break;
            }
            default:
                return null;
        }
        if (!content || isBinaryContent(content)) {
            return null;
        }
        return content;
    }
    catch {
        return null;
    }
}
function collectFiles(repoRoot, options) {
    let diffCmd;
    switch (options.mode) {
        case 'working':
            diffCmd = 'git diff --name-only HEAD';
            break;
        case 'staged':
            diffCmd = 'git diff --name-only --cached';
            break;
        case 'commit':
            diffCmd = `git diff --name-only ${options.commitSha}^..${options.commitSha}`;
            break;
        case 'range':
            diffCmd = `git diff --name-only ${options.baseRef}..${options.headRef}`;
            break;
        default:
            throw new Error(`Unknown scan mode: ${options.mode}`);
    }
    const output = exec(diffCmd, repoRoot);
    if (!output) {
        return [];
    }
    const filePaths = output.split('\n').filter(Boolean);
    if (filePaths.length > MAX_FILES) {
        throw new Error(`Too many files changed (${filePaths.length}). Maximum is ${MAX_FILES}. ` +
            `Consider narrowing your changes or using --range with a smaller scope.`);
    }
    const files = [];
    let totalBytes = 0;
    for (const filePath of filePaths) {
        const ref = options.mode === 'commit' ? options.commitSha : options.headRef;
        const content = getFileContent(repoRoot, filePath, options.mode, ref);
        if (content === null) {
            continue;
        }
        const fileBytes = Buffer.byteLength(content, 'utf-8');
        totalBytes += fileBytes;
        if (totalBytes > MAX_PAYLOAD_BYTES) {
            throw new Error(`Total payload exceeds 2MB limit. ` +
                `Consider narrowing your changes or excluding large files.`);
        }
        files.push({
            path: filePath,
            content,
            sha: exec(`git hash-object ${filePath}`, repoRoot) || undefined,
        });
    }
    return files;
}
function getScanModeFromOptions(options) {
    if (options.file) {
        return { mode: 'working', singleFile: options.file };
    }
    if (options.staged) {
        return { mode: 'staged' };
    }
    if (options.commit) {
        return { mode: 'commit', commitSha: options.commit };
    }
    if (options.range) {
        const [baseRef, headRef] = options.range.split('..');
        if (!baseRef || !headRef) {
            throw new Error('Range must be in format: base..head');
        }
        return { mode: 'range', baseRef, headRef };
    }
    return { mode: 'working' };
}
function collectSingleFile(repoRoot, filePath) {
    const fullPath = path.join(repoRoot, filePath);
    if (!fs.existsSync(fullPath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (isBinaryContent(content)) {
            return null;
        }
        return {
            path: filePath,
            content,
            sha: exec(`git hash-object "${filePath}"`, repoRoot) || undefined,
        };
    }
    catch {
        return null;
    }
}
const SCANNABLE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.java', '.go', '.rs', '.rb', '.php',
    '.tf', '.yaml', '.yml', '.json',
    '.cs', '.kt', '.scala', '.swift',
]);
const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out',
    '.next', '.nuxt', 'vendor', '__pycache__', '.venv',
    'target', 'bin', 'obj', '.terraform', '.cache',
]);
function collectAllFiles(repoRoot) {
    const files = [];
    let totalBytes = 0;
    function walkDir(dir, relativePath = '') {
        if (files.length >= MAX_FILES)
            return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= MAX_FILES)
                break;
            const fullPath = path.join(dir, entry.name);
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                    walkDir(fullPath, relPath);
                }
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!SCANNABLE_EXTENSIONS.has(ext))
                    continue;
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    if (isBinaryContent(content))
                        continue;
                    const fileBytes = Buffer.byteLength(content, 'utf-8');
                    if (totalBytes + fileBytes > MAX_PAYLOAD_BYTES) {
                        continue;
                    }
                    totalBytes += fileBytes;
                    files.push({
                        path: relPath,
                        content,
                        sha: exec(`git hash-object "${relPath}"`, repoRoot) || undefined,
                    });
                }
                catch {
                    continue;
                }
            }
        }
    }
    walkDir(repoRoot);
    return files;
}
//# sourceMappingURL=diff.js.map