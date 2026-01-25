export interface Finding {
    ruleId: string;
    severity: 'low' | 'medium' | 'high';
    title: string;
    file: string;
    line: number;
    message: string;
    recommendation: string;
    category: string;
    confidence: number;
}
export interface GatingResult {
    decision: 'PASS' | 'WARN' | 'BLOCK';
    findings: Finding[];
}
export declare function applyGatingLogic(findings: Finding[], backendDecision: 'pass' | 'warn' | 'block', mode: 'pre-commit' | 'pre-push' | 'manual'): GatingResult;
//# sourceMappingURL=gating.d.ts.map