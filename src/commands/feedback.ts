import { Command } from 'commander';
import { isAuthenticated } from '../config/store';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

interface FeedbackOptions {
  decisionId: string;
  success?: boolean;
  fail?: boolean;
  latencyMs?: number;
  costUsd?: number;
  errorType?: string;
}

async function submitFeedback(options: FeedbackOptions): Promise<void> {
  if (!isAuthenticated()) {
    console.log('Run: devx auth login');
    process.exit(3);
  }

  const aixBaseUrl = process.env.AIX_BASE_URL;
  const aixApiKey = process.env.AIX_API_KEY;

  if (!aixBaseUrl || !aixApiKey) {
    console.error(color('AIX Brain not configured. Set AIX_BASE_URL and AIX_API_KEY.', COLORS.red));
    process.exit(1);
  }

  const isSuccess = options.success !== undefined ? options.success : !options.fail;

  const payload = {
    decision_id: options.decisionId,
    execution_class: 'chat',
    provider: 'unknown',
    model_class: 'unknown',
    metrics: {
      latency_ms: options.latencyMs,
      cost_usd: options.costUsd,
      success: isSuccess,
      error_type: options.errorType,
    },
  };

  console.log('');
  console.log(color('CloudVerse DevX — Submitting Feedback', COLORS.cyan, COLORS.bold));
  console.log('');

  try {
    const http = require(aixBaseUrl.startsWith('https') ? 'https' : 'http');
    const { URL } = require('url');
    const url = new URL('/api/brain/feedback', aixBaseUrl);

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
              reject(new Error(`Brain feedback failed: ${res.statusCode}`));
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

    console.log(color('  ✓ Feedback submitted successfully', COLORS.green, COLORS.bold));
    console.log(`    Decision ID: ${options.decisionId}`);
    console.log(`    Success: ${isSuccess}`);
    if (options.latencyMs) console.log(`    Latency: ${options.latencyMs}ms`);
    if (options.costUsd) console.log(`    Cost: $${options.costUsd}`);
    console.log(`    Feedback loop: ${result.feedback_loop || 'processed'}`);
    console.log('');
  } catch (error: any) {
    console.error(color(`  ✗ Feedback failed: ${error.message}`, COLORS.red));
    process.exit(1);
  }
}

export function createFeedbackCommand(): Command {
  return new Command('feedback')
    .description('Submit execution feedback to AIX Brain after deployment')
    .requiredOption('--decision-id <id>', 'Brain decision ID from check results')
    .option('--success', 'Mark execution as successful')
    .option('--fail', 'Mark execution as failed')
    .option('--latency-ms <ms>', 'Actual latency in milliseconds', parseInt)
    .option('--cost-usd <usd>', 'Actual cost in USD', parseFloat)
    .option('--error-type <type>', 'Error type if failed')
    .action((options: FeedbackOptions) => submitFeedback(options));
}
