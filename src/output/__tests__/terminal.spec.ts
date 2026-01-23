import { describe, test, expect } from 'vitest';
import { applyGatingLogic, Finding } from '../gating';
import { renderTerminal } from '../terminal';

describe('CLI Always-On Logic', () => {
  const mockFindings: Finding[] = [
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

  test('Pre-commit: Should WARN even with high severity if category matches but decision is not block', () => {
    const result = applyGatingLogic(mockFindings, 'warn', 'pre-commit');
    expect(result.decision).toBe('WARN');
  });

  test('Pre-commit: Should BLOCK if all criteria met', () => {
    const result = applyGatingLogic(mockFindings, 'block', 'pre-commit');
    expect(result.decision).toBe('BLOCK');
  });

  test('Pre-push: Should BLOCK if backend decision is block', () => {
    const result = applyGatingLogic(mockFindings, 'block', 'pre-push');
    expect(result.decision).toBe('BLOCK');
  });

  test('Terminal Renderer: Strict format for BLOCK', () => {
    const gatingResult = { decision: 'BLOCK' as const, findings: mockFindings };
    const output = renderTerminal(gatingResult, 'pre-push');
    expect(output).toContain('❌  BLOCK — high-confidence cost risk');
    expect(output).toContain('Push blocked. Fix findings or bypass: git push --no-verify');
  });

  test('Terminal Renderer: Strict format for WARN', () => {
    const gatingResult = { decision: 'WARN' as const, findings: mockFindings };
    const output = renderTerminal(gatingResult, 'pre-commit');
    expect(output).toContain('⚠️  WARN — cost signals detected (commit allowed)');
    expect(output).toContain('Run: devx scan --staged --sync');
  });
});
