export interface DeviceAuthStartResponse {
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    pollInterval: number;
}
export interface DeviceAuthPollResponse {
    status: 'pending' | 'approved' | 'expired' | 'denied';
    accessToken?: string;
    userId?: string;
    orgId?: string;
    orgName?: string;
    expiresIn?: number;
}
export interface AnalyzeRequest {
    orgId: string;
    userId: string;
    machineId: string;
    repo: {
        provider: string;
        owner: string;
        name: string;
        remoteUrl: string;
    };
    scan: {
        mode: string;
        baseRef?: string;
        headRef?: string;
    };
    git: {
        branch: string;
        headSha: string;
    };
    files?: Array<{
        path: string;
        content: string;
        sha?: string;
    }>;
    diff?: {
        format: 'unified';
        unified: number;
        text: string;
        hash: string;
    };
    filesMeta?: Array<{
        path: string;
        status: string;
        additions: number;
        deletions: number;
    }>;
    client: {
        type: 'cli';
        version: string;
        os: string;
    };
}
export interface RebuttalStatusInfo {
    isExpired: boolean;
    isPending: boolean;
    daysUntilExpiry?: number;
    statusLabel: string;
    statusEmoji: string;
}
export interface Finding {
    id: string;
    ruleId: string;
    severity: 'low' | 'medium' | 'high';
    category: 'runtime' | 'provisioning' | 'governance';
    file: string;
    line: number;
    endLine?: number;
    title: string;
    message: string;
    recommendation: string;
    autofixAvailable: boolean;
    costImpact?: string;
    fingerprint?: string;
    confidence?: number;
    isTrusted?: boolean;
    rebuttalStatus?: RebuttalStatusInfo;
}
export interface AnalyzeResponse {
    decision: 'pass' | 'warn' | 'block';
    analysisType: 'code' | 'iac' | 'mixed';
    summary: {
        filesAnalyzed: number;
        codeFiles: number;
        iacFiles: number;
        estimatedImpact?: string;
        baseMonthly?: number;
        headMonthly?: number;
        deltaMonthly?: number;
        explanation: string;
    };
    findings: Finding[];
    policy: {
        blocked: boolean;
        blockReason: string | null;
    };
    usage: {
        unitsConsumed: number;
        unitsRemaining: number;
    };
}
export declare class ApiError extends Error {
    statusCode: number;
    code?: string | undefined;
    constructor(message: string, statusCode: number, code?: string | undefined);
}
export interface RefreshTokenResponse {
    accessToken: string;
    expiresIn: number;
    expiresAt: string;
}
export declare function startDeviceAuth(): Promise<DeviceAuthStartResponse>;
export declare function pollDeviceAuth(deviceCode: string): Promise<DeviceAuthPollResponse>;
export declare function analyze(payload: AnalyzeRequest): Promise<AnalyzeResponse>;
export declare function getClientInfo(): {
    type: 'cli';
    version: string;
    os: string;
};
export interface PingResponse {
    ok: boolean;
    serverTime: string;
    orgId: string;
    userId: string;
    machineId?: string;
    cliEnabled: boolean;
}
export declare function ping(): Promise<PingResponse>;
export interface AcceptFindingRequest {
    fingerprint: string;
    reason: string;
    scope?: 'line' | 'function' | 'file' | 'resource';
    severity?: 'LOW' | 'MEDIUM' | 'HIGH';
    appId?: string;
    expiresInDays?: number;
    ruleId?: string;
}
export interface IntentionalFindingData {
    id: string;
    fingerprint: string;
    ruleId: string;
    severity: string;
    reason: string;
    author: string;
    appId?: string;
    createdAt: string;
    expiresAt?: string;
    reviewStatus: 'auto' | 'pending' | 'approved' | 'rejected';
    reviewer?: string;
    reviewedAt?: string;
}
export interface AcceptFindingResponse {
    success: boolean;
    intentional?: IntentionalFindingData;
    requiresApproval?: boolean;
}
export declare function acceptFinding(params: AcceptFindingRequest): Promise<AcceptFindingResponse>;
export interface ListRebuttalsResponse {
    intentionals: IntentionalFindingData[];
}
export declare function listRebuttals(options?: {
    pending?: boolean;
    appId?: string;
}): Promise<ListRebuttalsResponse>;
export interface ApproveRejectResponse {
    success: boolean;
    intentional?: IntentionalFindingData;
}
export declare function approveRebuttal(id: string): Promise<ApproveRejectResponse>;
export declare function rejectRebuttal(id: string): Promise<ApproveRejectResponse>;
//# sourceMappingURL=client.d.ts.map