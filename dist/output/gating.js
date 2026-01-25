"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyGatingLogic = applyGatingLogic;
function applyGatingLogic(findings, backendDecision, mode) {
    if (findings.length === 0) {
        return { decision: 'PASS', findings: [] };
    }
    if (mode === 'pre-commit') {
        const blockingCategories = ['unbounded_scale', 'retry_storm', 'fanout_explosion'];
        const shouldBlock = findings.some(f => backendDecision === 'block' &&
            f.severity === 'high' &&
            f.confidence >= 0.85 &&
            blockingCategories.includes(f.category));
        return {
            decision: shouldBlock ? 'BLOCK' : 'WARN',
            findings
        };
    }
    if (mode === 'pre-push') {
        return {
            decision: backendDecision === 'block' ? 'BLOCK' : 'WARN',
            findings
        };
    }
    // Manual or default
    const decisionMap = {
        pass: 'PASS',
        warn: 'WARN',
        block: 'BLOCK'
    };
    return {
        decision: decisionMap[backendDecision] || 'WARN',
        findings
    };
}
//# sourceMappingURL=gating.js.map