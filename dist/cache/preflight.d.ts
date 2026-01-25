export interface PreflightResult {
    hasRelevantChanges: boolean;
    codeFiles: string[];
    iacFiles: string[];
    totalFiles: string[];
    reason?: string;
}
export declare function runPreflight(repoRoot: string, mode: 'working' | 'staged' | 'commit' | 'range', options?: {
    baseRef?: string;
    headRef?: string;
    commitSha?: string;
}): PreflightResult;
//# sourceMappingURL=preflight.d.ts.map