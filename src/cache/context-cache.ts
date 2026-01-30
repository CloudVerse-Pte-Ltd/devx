import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

interface CachedContextProfile {
  profile: {
    contextJson: any;
    contextHash: string;
    confidence: string;
    derivedAt: string;
    expiresAt: string;
    sources: any[];
  };
  lastHash: string;
  lastFetchedAt: string;
}

function getCacheDir(): string {
  const home = os.homedir();
  return path.join(home, '.cloudverse', 'devx', 'cache', 'context');
}

function getRepoKey(remoteUrl: string): string {
  return createHash('sha256').update(remoteUrl).digest('hex').substring(0, 16);
}

function getCachePath(orgId: string, remoteUrl: string): string {
  const dir = path.join(getCacheDir(), orgId);
  const repoKey = getRepoKey(remoteUrl);
  return path.join(dir, `${repoKey}.json`);
}

export function getContextFromCache(orgId: string, remoteUrl: string): CachedContextProfile | null {
  try {
    const cachePath = getCachePath(orgId, remoteUrl);
    if (!fs.existsSync(cachePath)) return null;

    const content = fs.readFileSync(cachePath, 'utf-8');
    const cached = JSON.parse(content) as CachedContextProfile;

    if (new Date(cached.profile.expiresAt) < new Date()) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

export function saveContextToCache(
  orgId: string,
  remoteUrl: string,
  profile: CachedContextProfile['profile']
): void {
  try {
    const cachePath = getCachePath(orgId, remoteUrl);
    const dir = path.dirname(cachePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const cached: CachedContextProfile = {
      profile,
      lastHash: profile.contextHash,
      lastFetchedAt: new Date().toISOString(),
    };

    fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
  } catch {
  }
}

export function getCachedContextHash(orgId: string, remoteUrl: string): string | null {
  const cached = getContextFromCache(orgId, remoteUrl);
  return cached?.lastHash || null;
}

export function clearContextCache(orgId: string, remoteUrl: string): void {
  try {
    const cachePath = getCachePath(orgId, remoteUrl);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch {
  }
}
