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
export declare function getConfig(): DevxConfig;
export declare function getDefaultConfig(): DevxConfig;
export declare function saveConfig(config: DevxConfig): void;
export declare function clearConfig(): void;
export declare function isAuthenticated(): boolean;
export declare function getAccessToken(): string | undefined;
export declare function getMaskedToken(token: string | undefined): string;
//# sourceMappingURL=store.d.ts.map