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

async function status(): Promise<void> {
  if (!isAuthenticated()) {
    console.log('Run: devx auth login');
    process.exit(3);
  }

  const aixBaseUrl = process.env.AIX_BASE_URL;
  const aixApiKey = process.env.AIX_API_KEY;

  console.log('');
  console.log(color('CloudVerse DevX — AIX Brain Status', COLORS.cyan, COLORS.bold));
  console.log('');

  if (!aixBaseUrl || !aixApiKey) {
    console.log(color('  AIX Brain: Not Configured', COLORS.yellow, COLORS.bold));
    console.log('  Set AIX_BASE_URL and AIX_API_KEY environment variables.');
    console.log('');
    process.exit(0);
  }

  console.log(`  Endpoint: ${aixBaseUrl}`);

  const http = require(aixBaseUrl.startsWith('https') ? 'https' : 'http');
  const { URL } = require('url');

  try {
    const healthUrl = new URL('/api/brain/health', aixBaseUrl);
    const healthResult: any = await httpGet(http, healthUrl, aixApiKey);
    console.log(color(`  Health: ${healthResult.status || 'ok'}`, COLORS.green, COLORS.bold));
    if (healthResult.version) console.log(`  Version: ${healthResult.version}`);
  } catch (error: any) {
    console.log(color(`  Health: unreachable (${error.message})`, COLORS.red, COLORS.bold));
  }

  try {
    const catalogUrl = new URL('/api/brain/catalog/status', aixBaseUrl);
    const catalogResult: any = await httpGet(http, catalogUrl, aixApiKey);
    console.log('');
    console.log(color('  Catalog', COLORS.bold));
    console.log(`    Total models: ${catalogResult.total_models || 'unknown'}`);
    console.log(`    Last updated: ${catalogResult.last_updated || 'unknown'}`);

    if (catalogResult.providers?.length > 0) {
      console.log('');
      console.log(color('  Providers', COLORS.bold));
      for (const p of catalogResult.providers) {
        const statusIcon = p.status === 'active' ? '✓' : '✗';
        console.log(`    ${statusIcon} ${p.name} (${p.models?.length || 0} models)`);
      }
    }
  } catch {
    console.log('');
    console.log(color('  Catalog: unavailable', COLORS.yellow));
  }

  console.log('');
}

function httpGet(httpModule: any, url: any, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const r = httpModule.get(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: { 'Authorization': `Bearer ${apiKey}` },
      },
      (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid response')); }
        });
      }
    );
    r.on('error', reject);
  });
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show AIX Brain health and catalog status')
    .action(() => status());
}
