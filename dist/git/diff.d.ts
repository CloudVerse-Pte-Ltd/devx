export type ScanMode = 'working' | 'staged' | 'commit' | 'range';
export interface FileEntry {
    path: string;
    content: string;
    sha?: string;
}
export interface DiffOptions {
    mode: ScanMode;
    commitSha?: string;
    baseRef?: string;
    headRef?: string;
}
export declare function collectFiles(repoRoot: string, options: DiffOptions): FileEntry[];
export declare function getScanModeFromOptions(options: {
    staged?: boolean;
    commit?: string;
    range?: string;
    file?: string;
}): DiffOptions & {
    singleFile?: string;
};
export declare function collectSingleFile(repoRoot: string, filePath: string): FileEntry | null;
export declare function collectAllFiles(repoRoot: string): FileEntry[];
//# sourceMappingURL=diff.d.ts.map