import { AnalyzeResponse } from '../api/client';
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
export declare function computeDiffHash(diffText: string): string;
export declare function computeCacheKey(params: CacheKeyParams): string;
export declare function getCacheEntry(key: string): CacheEntry | null;
export declare function setCacheEntry(key: string, response: AnalyzeResponse, diffHash: string, ttlSeconds: number, rulesetVersion?: string): void;
export declare function clearCache(): void;
export declare function cleanExpiredCache(): number;
export declare function getCacheStats(): {
    entries: number;
    sizeBytes: number;
};
export declare const DEFAULT_TTL_WORKING = 600;
export declare const DEFAULT_TTL_RANGE = 3600;
//# sourceMappingURL=store.d.ts.map