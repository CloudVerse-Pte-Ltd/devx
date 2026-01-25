export interface GitContext {
    repoRoot: string;
    provider: 'github' | 'gitlab' | 'azure' | 'bitbucket' | 'unknown';
    owner: string;
    name: string;
    remoteUrl: string;
    branch: string;
    headSha: string;
    defaultBranch: string;
}
export declare function resolveGitContext(): GitContext;
export declare function validateGitContext(context: GitContext): void;
//# sourceMappingURL=resolve.d.ts.map