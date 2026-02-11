import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, isAuthenticated, getOrgId, getAccessToken } from '../config/store';
import { resolveGitContext } from '../git/resolve';
import { ApiError } from '../api/client';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

interface CheckOptions {
  files?: string[];
  pr?: string;
  repo?: string;
  format?: 'table' | 'json';
}

interface DetectedUsage {
  file: string;
  line: number;
  pattern_type: string;
  detected_model?: string;
  detected_provider?: string;
  execution_class_hint?: string;
  raw_match: string;
  confidence: number;
}

const MODEL_PATTERNS = [
  { regex: /model\s*[:=]\s*["']?(gpt-4o-mini|gpt-4o|gpt-4-turbo|gpt-4|gpt-3\.5-turbo|o1-preview|o1-mini|o1|o3-mini)["']?/gi, provider: 'openai' },
  { regex: /model\s*[:=]\s*["']?(claude-3[.-]5?-?(opus|sonnet|haiku)|claude-3-opus|claude-3-sonnet|claude-3-haiku|claude-4)["']?/gi, provider: 'anthropic' },
  { regex: /model\s*[:=]\s*["']?(gemini-2\.0-flash|gemini-1\.5-pro|gemini-1\.5-flash|gemini-pro)["']?/gi, provider: 'google' },
  { regex: /model\s*[:=]\s*["']?(mistral-large|mistral-medium|mistral-small|mixtral|codestral)["']?/gi, provider: 'mistral' },
  { regex: /model\s*[:=]\s*["']?(command-r-plus|command-r|command)["']?/gi, provider: 'cohere' },
  { regex: /model\s*[:=]\s*["']?(text-embedding-3-small|text-embedding-3-large|text-embedding-ada-002)["']?/gi, provider: 'openai', execution_class: 'embedding' },
];

const IMPORT_PATTERNS = [
  { regex: /from\s+["']openai["']|require\s*\(\s*["']openai["']\s*\)/g, provider: 'openai' },
  { regex: /from\s+["']@anthropic-ai\/sdk["']|require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)/g, provider: 'anthropic' },
  { regex: /from\s+["']cohere-ai["']|require\s*\(\s*["']cohere-ai["']\s*\)/g, provider: 'cohere' },
  { regex: /from\s+["']@google\/generative-ai["']/g, provider: 'google' },
];

const API_CALL_PATTERNS = [
  { regex: /\.chat\.completions\.create\s*\(/g, provider: 'openai', execution_class: 'chat' },
  { regex: /\.embeddings\.create\s*\(/g, provider: 'openai', execution_class: 'embedding' },
  { regex: /\.messages\.create\s*\(/g, provider: 'anthropic', execution_class: 'chat' },
  { regex: /\.generate_content\s*\(/g, provider: 'google', execution_class: 'chat' },
];

function inferExecutionClass(model: string): string {
  const l = model.toLowerCase();
  if (l.includes('embed')) return 'embedding';
  if (l.includes('dall-e')) return 'image_generation';
  if (l.includes('code') || l.includes('codestral')) return 'code_generation';
  return 'chat';
}

function scanLocalFiles(filePaths: string[]): DetectedUsage[] {
  const results: DetectedUsage[] = [];

  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pat of MODEL_PATTERNS) {
        const r = new RegExp(pat.regex.source, pat.regex.flags);
        let m: RegExpExecArray | null;
        while ((m = r.exec(line)) !== null) {
          const modelMatch = m[0].match(/["']([^"']+)["']/);
          const modelName = modelMatch ? modelMatch[1] : m[1];
          results.push({
            file: fp,
            line: i + 1,
            pattern_type: 'model_name',
            detected_model: modelName,
            detected_provider: pat.provider,
            execution_class_hint: (pat as any).execution_class || inferExecutionClass(modelName || ''),
            raw_match: m[0].trim(),
            confidence: 0.95,
          });
        }
      }

      for (const pat of IMPORT_PATTERNS) {
        const r = new RegExp(pat.regex.source, pat.regex.flags);
        if (r.test(line)) {
          results.push({
            file: fp,
            line: i + 1,
            pattern_type: 'provider_import',
            detected_provider: pat.provider,
            raw_match: line.trim(),
            confidence: 0.6,
          });
        }
      }

      for (const pat of API_CALL_PATTERNS) {
        const r = new RegExp(pat.regex.source, pat.regex.flags);
        if (r.test(line)) {
          results.push({
            file: fp,
            line: i + 1,
            pattern_type: 'api_call',
            detected_provider: pat.provider,
            execution_class_hint: pat.execution_class,
            raw_match: line.trim(),
            confidence: 0.85,
          });
        }
      }
    }
  }

  return results;
}

function collectScanFiles(dir: string): string[] {
  const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.cs', '.tf', '.yaml', '.yml'];
  const ignore = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'];
  const files: string[] = [];

  function walk(d: string) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (ignore.includes(entry.name)) continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(full);
        }
      }
    } catch {}
  }

  walk(dir);
  return files.slice(0, 200);
}

async function check(options: CheckOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log('');
    console.log('CloudVerse DevX CLI');
    console.log('Run: devx auth login');
    console.log('');
    process.exit(3);
  }

  console.log('');
  console.log(color('CloudVerse DevX — AIX Brain Check', COLORS.cyan, COLORS.bold));
  console.log('');

  let filesToScan: string[] = [];

  if (options.files && options.files.length > 0) {
    filesToScan = options.files.filter(f => fs.existsSync(f));
  } else {
    try {
      const ctx = resolveGitContext();
      filesToScan = collectScanFiles(ctx.repoRoot);
    } catch {
      filesToScan = collectScanFiles(process.cwd());
    }
  }

  if (filesToScan.length === 0) {
    console.log(color('  No scannable files found.', COLORS.yellow));
    process.exit(0);
  }

  console.log(`  Scanning ${filesToScan.length} files for LLM/AI usage patterns...`);
  console.log('');

  const usages = scanLocalFiles(filesToScan);

  if (usages.length === 0) {
    console.log(color('  ✓ No LLM/AI model usage patterns detected.', COLORS.green, COLORS.bold));
    process.exit(0);
  }

  const modelUsages = usages.filter(u => u.pattern_type === 'model_name');
  const importUsages = usages.filter(u => u.pattern_type === 'provider_import');
  const apiCallUsages = usages.filter(u => u.pattern_type === 'api_call');

  console.log(`  Found ${usages.length} LLM usage pattern(s):`);
  console.log(`    Model references: ${modelUsages.length}`);
  console.log(`    Provider imports: ${importUsages.length}`);
  console.log(`    API calls: ${apiCallUsages.length}`);
  console.log('');

  if (options.format === 'json') {
    console.log(JSON.stringify({ usages, summary: { total: usages.length, models: modelUsages.length, imports: importUsages.length, apiCalls: apiCallUsages.length } }, null, 2));
    process.exit(0);
  }

  const aixBaseUrl = process.env.AIX_BASE_URL;
  const aixApiKey = process.env.AIX_API_KEY;

  if (!aixBaseUrl || !aixApiKey) {
    console.log(color('  ⚠ AIX Brain not configured. Set AIX_BASE_URL and AIX_API_KEY for cost recommendations.', COLORS.yellow));
    console.log('');

    for (const usage of modelUsages) {
      const icon = '🔍';
      console.log(`  ${icon} ${usage.file}:${usage.line}`);
      console.log(`     Model: ${usage.detected_model || 'unknown'} (${usage.detected_provider})`);
      console.log(`     Class: ${usage.execution_class_hint || 'chat'}`);
      console.log('');
    }

    process.exit(0);
  }

  console.log('  Querying AIX Brain for recommendations...');
  console.log('');

  const seen = new Set<string>();

  for (const usage of modelUsages) {
    const key = `${usage.detected_model}:${usage.execution_class_hint}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const config = getConfig();
      const response = await brainDecide(aixBaseUrl, aixApiKey, {
        intent: `Optimize ${usage.detected_model} usage`,
        execution_class: usage.execution_class_hint || 'chat',
        model_name: usage.detected_model,
        mode: 'provider',
      });

      const currentModel = usage.detected_model || 'unknown';
      const recModel = response.recommended?.model_name || 'N/A';
      const recProvider = response.recommended?.provider || 'N/A';

      if (recModel !== currentModel) {
        console.log(`  📊 ${color(usage.file + ':' + usage.line, COLORS.bold)}`);
        console.log(`     Current:     ${currentModel} (${usage.detected_provider})`);
        console.log(`     Recommended: ${color(recModel, COLORS.green)} (${recProvider})`);
        console.log(`     Confidence:  ${response.confidence_hint} (${(response.confidence * 100).toFixed(0)}%)`);
        console.log(`     Pricing:     $${response.pricing?.input_per_1k}/1K input`);
        if (response.alternatives?.length > 0) {
          console.log(`     Alternatives: ${response.alternatives.length} evaluated`);
        }
        console.log(`     Decision ID: ${response.decision_id}`);
      } else {
        console.log(`  ✓ ${color(usage.file + ':' + usage.line, COLORS.dim)}`);
        console.log(`     ${currentModel} — already optimal (${response.confidence_hint})`);
      }
      console.log('');
    } catch (error: any) {
      console.log(`  ⚠ ${usage.file}:${usage.line} — Brain unavailable: ${error.message}`);
      console.log('');
    }
  }

  process.exit(0);
}

async function brainDecide(baseUrl: string, apiKey: string, req: any): Promise<any> {
  const http = require(baseUrl.startsWith('https') ? 'https' : 'http');
  const { URL } = require('url');

  const url = new URL('/api/brain/decide', baseUrl);

  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Brain API error: ${res.statusCode}`));
            return;
          }
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid response')); }
        });
      }
    );
    r.on('error', reject);
    r.write(JSON.stringify(req));
    r.end();
  });
}

export function createCheckCommand(): Command {
  return new Command('check')
    .description('Check code for LLM/AI cost optimization opportunities using AIX Brain')
    .option('--files <paths...>', 'Specific files to check')
    .option('--pr <number>', 'Check a PR diff (CI mode)')
    .option('--repo <org/repo>', 'Repository for PR mode')
    .option('--format <format>', 'Output format: table, json', 'table')
    .action((options: CheckOptions) => check(options));
}
