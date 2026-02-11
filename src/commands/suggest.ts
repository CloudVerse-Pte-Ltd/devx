import { Command } from 'commander';
import { isAuthenticated } from '../config/store';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

interface SuggestOptions {
  model?: string;
  executionClass: string;
  maxCost?: number;
  maxLatency?: number;
}

async function suggest(options: SuggestOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log('Run: devx auth login');
    process.exit(3);
  }

  const aixBaseUrl = process.env.AIX_BASE_URL;
  const aixApiKey = process.env.AIX_API_KEY;

  if (!aixBaseUrl || !aixApiKey) {
    console.error(color('AIX Brain not configured. Set AIX_BASE_URL and AIX_API_KEY.', COLORS.yellow));
    process.exit(1);
  }

  console.log('');
  console.log(color('CloudVerse DevX — AIX Brain Suggestion', COLORS.cyan, COLORS.bold));
  console.log('');

  const payload: any = {
    intent: `Best model for ${options.executionClass}`,
    execution_class: options.executionClass,
    mode: options.model ? 'provider' : 'execution_class',
    model_name: options.model,
    constraints: {},
  };

  if (options.maxCost) payload.constraints.max_cost_per_1k_tokens = options.maxCost;
  if (options.maxLatency) payload.constraints.max_latency_ms = options.maxLatency;

  try {
    const http = require(aixBaseUrl.startsWith('https') ? 'https' : 'http');
    const { URL } = require('url');
    const url = new URL('/api/brain/decide', aixBaseUrl);

    const result: any = await new Promise((resolve, reject) => {
      const r = http.request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          headers: {
            'Authorization': `Bearer ${aixApiKey}`,
            'Content-Type': 'application/json',
          },
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 400) {
              reject(new Error(`Brain suggest failed: ${res.statusCode}`));
              return;
            }
            try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid response')); }
          });
        }
      );
      r.on('error', reject);
      r.write(JSON.stringify(payload));
      r.end();
    });

    console.log(color('  Recommended Model', COLORS.bold));
    console.log(`    Provider:        ${result.recommended?.provider}`);
    console.log(`    Model:           ${color(result.recommended?.model_name, COLORS.green, COLORS.bold)}`);
    console.log(`    Execution Class: ${result.recommended?.execution_class}`);
    console.log(`    Confidence:      ${result.confidence_hint} (${(result.confidence * 100).toFixed(0)}%)`);
    console.log('');
    console.log(color('  Pricing', COLORS.bold));
    console.log(`    Input:  $${result.pricing?.input_per_1k}/1K tokens`);
    console.log(`    Output: $${result.pricing?.output_per_1k}/1K tokens`);
    console.log('');

    if (result.alternatives?.length > 0) {
      console.log(color('  Alternatives', COLORS.bold));
      for (const alt of result.alternatives.slice(0, 5)) {
        console.log(`    • ${alt.model_name} (${alt.provider}) — $${alt.pricing?.input_per_1k}/1K input`);
      }
      console.log('');
    }

    console.log(`  ${result.explanation}`);
    console.log('');
  } catch (error: any) {
    console.error(color(`  Brain unavailable: ${error.message}`, COLORS.yellow));
    process.exit(1);
  }
}

export function createSuggestCommand(): Command {
  return new Command('suggest')
    .description('Get model recommendation from AIX Brain')
    .option('--model <name>', 'Current model to compare against')
    .requiredOption('--execution-class <class>', 'Execution class: chat, embedding, code_generation, image_generation')
    .option('--max-cost <cost>', 'Max cost per 1K tokens', parseFloat)
    .option('--max-latency <ms>', 'Max latency in ms', parseInt)
    .action((options: SuggestOptions) => suggest(options));
}
