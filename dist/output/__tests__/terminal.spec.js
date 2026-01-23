"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const gating_1 = require("../gating");
const terminal_1 = require("../terminal");
(0, vitest_1.describe)('CLI Always-On Logic', () => {
    const mockFindings = [
        {
            ruleId: 'test-rule',
            severity: 'high',
            title: 'Expensive Query',
            file: 'db.ts',
            line: 10,
            message: 'Unbounded query',
            recommendation: 'Add limit',
            category: 'unbounded_scale',
            confidence: 0.9,
        },
    ];
    (0, vitest_1.test)('Pre-commit: Should WARN even with high severity if category matches but decision is not block', () => {
        const result = (0, gating_1.applyGatingLogic)(mockFindings, 'warn', 'pre-commit');
        (0, vitest_1.expect)(result.decision).toBe('WARN');
    });
    (0, vitest_1.test)('Pre-commit: Should BLOCK if all criteria met', () => {
        const result = (0, gating_1.applyGatingLogic)(mockFindings, 'block', 'pre-commit');
        (0, vitest_1.expect)(result.decision).toBe('BLOCK');
    });
    (0, vitest_1.test)('Pre-push: Should BLOCK if backend decision is block', () => {
        const result = (0, gating_1.applyGatingLogic)(mockFindings, 'block', 'pre-push');
        (0, vitest_1.expect)(result.decision).toBe('BLOCK');
    });
    (0, vitest_1.test)('Terminal Renderer: Strict format for BLOCK', () => {
        const gatingResult = { decision: 'BLOCK', findings: mockFindings };
        const output = (0, terminal_1.renderTerminal)(gatingResult, 'pre-push');
        (0, vitest_1.expect)(output).toContain('❌  BLOCK — high-confidence cost risk');
        (0, vitest_1.expect)(output).toContain('Push blocked. Fix findings or bypass: git push --no-verify');
    });
    (0, vitest_1.test)('Terminal Renderer: Strict format for WARN', () => {
        const gatingResult = { decision: 'WARN', findings: mockFindings };
        const output = (0, terminal_1.renderTerminal)(gatingResult, 'pre-commit');
        (0, vitest_1.expect)(output).toContain('⚠️  WARN — cost signals detected (commit allowed)');
        (0, vitest_1.expect)(output).toContain('Run: devx scan --staged --sync');
    });
});
//# sourceMappingURL=terminal.spec.js.map