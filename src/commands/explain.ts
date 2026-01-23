import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfig, isAuthenticated } from '../config/store';

const CACHE_DIR = path.join(os.homedir(), '.cloudverse', 'devx', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'rules.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RuleExplanation {
  ruleId: string;
  title: string;
  category: 'runtime' | 'provisioning' | 'governance';
  whyItMatters: string;
  examples: {
    bad: string;
    good: string;
  };
  recommendations: string[];
  autofix: {
    available: boolean;
    notes?: string;
  };
}

interface CacheEntry {
  data: RuleExplanation;
  timestamp: number;
}

interface RuleCache {
  [ruleId: string]: CacheEntry;
}

function loadCache(): RuleCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
  }
  return {};
}

function saveCache(cache: RuleCache): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
  }
}

function getCachedRule(ruleId: string): RuleExplanation | null {
  const cache = loadCache();
  const entry = cache[ruleId];
  
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  
  return null;
}

function setCachedRule(ruleId: string, data: RuleExplanation): void {
  const cache = loadCache();
  cache[ruleId] = { data, timestamp: Date.now() };
  saveCache(cache);
}

async function fetchRuleExplanation(ruleId: string): Promise<RuleExplanation | null> {
  const config = getConfig();
  
  if (!config.accessToken) {
    return null;
  }
  
  try {
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');
    
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
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });
      
      req.on('error', () => resolve(null));
      req.end();
    });
  } catch {
    return null;
  }
}

function formatExplanation(rule: RuleExplanation): string {
  const lines: string[] = [];
  
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

async function explain(ruleId: string, options: { json?: boolean }): Promise<void> {
  if (!isAuthenticated()) {
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
    } else {
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
  } else {
    console.log(formatExplanation(rule));
  }
}

export function createExplainCommand(): Command {
  return new Command('explain')
    .description('Get detailed explanation for a cost rule')
    .argument('<ruleId>', 'The rule ID to explain (e.g., CODE_CHATTY_API_LOOP)')
    .option('--json', 'Output as JSON')
    .action(explain);
}
