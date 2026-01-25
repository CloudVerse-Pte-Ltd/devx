export interface UnifiedDiff {
    format: 'unified';
    unified: number;
    text: string;
    hash: string;
    sizeBytes: number;
}
export interface FileMeta {
    path: string;
    status: 'A' | 'M' | 'D' | 'R' | 'C';
    additions: number;
    deletions: number;
}
export interface DiffPayload {
    diff: UnifiedDiff;
    filesMeta: FileMeta[];
}
export declare function getUnifiedDiff(repoRoot: string, mode: 'working' | 'staged' | 'commit' | 'range', options?: {
    baseRef?: string;
    headRef?: string;
    commitSha?: string;
}): DiffPayload | null;
export declare function getDiffHash(repoRoot: string, mode: 'working' | 'staged' | 'commit' | 'range', options?: {
    baseRef?: string;
    headRef?: string;
    commitSha?: string;
}): string;
//# sourceMappingURL=unified-diff.d.ts.map