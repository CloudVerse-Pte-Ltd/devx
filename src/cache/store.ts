import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { AnalyzeResponse } from '../api/client';

const CACHE_DIR = path.join(os.homedir(), '.cloudverse', 'devx', 'cache');

export interface CacheEntry {
  key: string;
  response: AnalyzeResponse;
  createdAt: string;
  expiresAt: string;
  rulesetVersion?: string;
  diffHash: string;
}

export interface CacheKeyParams {
  remoteUrl: string;
  mode: string;
  diffHash: string;
  policyId?: string;
  rulesetVersion?: string;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function computeDiffHash(diffText: string): string {
  return crypto.createHash('sha256').update(diffText).digest('hex');
}

export function computeCacheKey(params: CacheKeyParams): string {
  const keyData = [
    params.remoteUrl,
    params.mode,
    params.diffHash,
    params.policyId || '',
    params.rulesetVersion || '',
  ].join('|');
  
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

function getCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function getCacheEntry(key: string): CacheEntry | null {
  ensureCacheDir();
  
  const cachePath = getCachePath(key);
  
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const entry = JSON.parse(content) as CacheEntry;
    
    if (new Date(entry.expiresAt) < new Date()) {
      fs.unlinkSync(cachePath);
      return null;
    }
    
    return entry;
  } catch {
    return null;
  }
}

export function setCacheEntry(
  key: string,
  response: AnalyzeResponse,
  diffHash: string,
  ttlSeconds: number,
  rulesetVersion?: string
): void {
  ensureCacheDir();
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  
  const entry: CacheEntry = {
    key,
    response,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    rulesetVersion,
    diffHash,
  };
  
  const cachePath = getCachePath(key);
  fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
}

export function clearCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
  }
}

export function cleanExpiredCache(): number {
  ensureCacheDir();
  
  let cleaned = 0;
  const files = fs.readdirSync(CACHE_DIR);
  const now = new Date();
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(CACHE_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry;
      
      if (new Date(entry.expiresAt) < now) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    } catch {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }
  
  return cleaned;
}

export function getCacheStats(): { entries: number; sizeBytes: number } {
  ensureCacheDir();
  
  const files = fs.readdirSync(CACHE_DIR);
  let sizeBytes = 0;
  let entries = 0;
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(CACHE_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      sizeBytes += stats.size;
      entries++;
    } catch {
      // Skip
    }
  }
  
  return { entries, sizeBytes };
}

export const DEFAULT_TTL_WORKING = 600;
export const DEFAULT_TTL_RANGE = 3600;
