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

export function applyGatingLogic(
  findings: Finding[],
  backendDecision: 'pass' | 'warn' | 'block',
  mode: 'pre-commit' | 'pre-push' | 'manual'
): GatingResult {
  if (findings.length === 0) {
    return { decision: 'PASS', findings: [] };
  }

  if (mode === 'pre-commit') {
    const blockingCategories = ['unbounded_scale', 'retry_storm', 'fanout_explosion'];
    const shouldBlock = findings.some(f => 
      backendDecision === 'block' &&
      f.severity === 'high' &&
      f.confidence >= 0.85 &&
      blockingCategories.includes(f.category)
    );

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
  const decisionMap: Record<string, 'PASS' | 'WARN' | 'BLOCK'> = {
    pass: 'PASS',
    warn: 'WARN',
    block: 'BLOCK'
  };
  return {
    decision: decisionMap[backendDecision] || 'WARN',
    findings
  };
}
