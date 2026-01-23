import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface DevxConfig {
  apiBaseUrl: string;
  orgId?: string;
  orgName?: string;
  userId?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
  defaultBranch: string;
  machineId: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.cloudverse', 'devx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function generateMachineId(): string {
  return crypto.randomUUID();
}

export function getConfig(): DevxConfig {
  ensureConfigDir();
  
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return getDefaultConfig();
    }
  }
  
  return getDefaultConfig();
}

export function getDefaultConfig(): DevxConfig {
  return {
    apiBaseUrl: 'https://devx.cloudverse.ai',
    defaultBranch: 'main',
    machineId: generateMachineId(),
  };
}

export function saveConfig(config: DevxConfig): void {
  ensureConfigDir();
  
  const data = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_FILE, data, { mode: 0o600 });
}

export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

export function isAuthenticated(): boolean {
  const config = getConfig();
  return !!(config.accessToken && config.orgId && config.userId);
}

export function getAccessToken(): string | undefined {
  return getConfig().accessToken;
}

export function getMaskedToken(token: string | undefined): string {
  if (!token) return '(not set)';
  if (token.length <= 8) return '****';
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}
