export interface HooksConfig {
    preCommit: {
        enabled: boolean;
        format: 'quiet' | 'summary' | 'full';
        blockOn: 'block' | 'warn' | 'none';
        showCostImpact: boolean;
    };
    prePush: {
        enabled: boolean;
        format: 'quiet' | 'summary' | 'full';
        blockOn: 'block' | 'warn' | 'none';
        showCostImpact: boolean;
        compareWith: 'origin/main' | 'origin/master' | 'auto';
    };
}
export declare function loadHooksConfig(): HooksConfig;
export declare function saveHooksConfig(config: Partial<HooksConfig>): void;
export declare function generatePreCommitHook(config: HooksConfig): string;
export declare function generatePrePushHook(config: HooksConfig): string;
export declare function getDefaultConfig(): HooksConfig;
//# sourceMappingURL=hooks-config.d.ts.map