import { AnalyzeResponse, Finding, CostAmplifier } from '../api/client';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function colorize(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'high': return COLORS.red;
    case 'medium': return COLORS.yellow;
    case 'low': return COLORS.blue;
    default: return COLORS.white;
  }
}

function getDecisionColor(decision: string): string {
  switch (decision) {
    case 'pass': return COLORS.green;
    case 'warn': return COLORS.yellow;
    case 'block': return COLORS.red;
    default: return COLORS.white;
  }
}

function formatRebuttalStatus(finding: Finding): string {
  if (!finding.rebuttalStatus) return '';
  
  const { statusEmoji, statusLabel } = finding.rebuttalStatus;
  return colorize(` ${statusEmoji} ${statusLabel}`, COLORS.dim);
}

function formatFinding(finding: Finding, index: number): string[] {
  const lines: string[] = [];
  const severity = colorize(finding.severity.toUpperCase().padEnd(10), getSeverityColor(finding.severity), COLORS.bold);
  const location = finding.file ? colorize(`${finding.file}:${finding.line}`, COLORS.cyan) : '—';
  const impact = finding.costImpact || '—';
  const trustedLabel = finding.isTrusted ? colorize(' (Trusted)', COLORS.dim) : '';
  const confidence = finding.confidence ? ` [${Math.round(finding.confidence * 100)}%]` : '';
  const rebuttalLabel = formatRebuttalStatus(finding);
  
  lines.push(`${severity} ${finding.title}${trustedLabel}${confidence}`);
  lines.push(colorize(`           ${location} — Est. impact: ${impact}`, COLORS.dim));
  
  if (rebuttalLabel) {
    lines.push(rebuttalLabel);
  }
  
  if (finding.message) {
    lines.push(colorize(`           Why: ${finding.message}`, COLORS.dim));
  }
  if (finding.recommendation) {
    lines.push(colorize(`           Fix: ${finding.recommendation}`, COLORS.dim));
  }
  
  if (finding.fingerprint) {
    const fp = finding.fingerprint.slice(0, 8);
    lines.push('');
    lines.push(colorize('           Actions:', COLORS.bold));
    lines.push(colorize(`             devx fix ${fp}`, COLORS.cyan));
    lines.push(colorize(`             devx accept ${fp} --reason "explanation here"`, COLORS.cyan));
  }
  
  lines.push('');
  return lines;
}

function formatAnalysisType(analysisType: 'code' | 'iac' | 'mixed'): string {
  switch (analysisType) {
    case 'code':
      return colorize('CloudVerse DevX — Cost Impact Check', COLORS.bold) + '\n' +
             colorize('This change may increase runtime cloud cost.', COLORS.yellow) + '\n' +
             colorize('Cost increases often come from small code changes (loops, retries, API fan-out, logging).', COLORS.dim);
    case 'iac':
      return colorize('CloudVerse DevX — Provisioning Cost Impact (IaC)', COLORS.bold) + '\n' +
             colorize('This change introduces infrastructure configuration that may affect cloud cost.', COLORS.yellow);
    case 'mixed':
      return colorize('CloudVerse DevX — Cost Impact Check (Code + IaC)', COLORS.bold) + '\n' +
             colorize('This change may affect infrastructure and runtime cloud cost.', COLORS.yellow);
  }
}

function formatCostSignalSummary(response: AnalyzeResponse): string[] {
  const lines: string[] = [colorize('Summary', COLORS.bold)];
  const { filesAnalyzed, codeFiles, iacFiles, baseMonthly, headMonthly, deltaMonthly } = response.summary;
  
  if (response.analysisType === 'iac' || response.analysisType === 'mixed') {
    lines.push(`IaC files analyzed: ${iacFiles}`);
    lines.push(`Code files analyzed: ${codeFiles}`);
    if (baseMonthly !== undefined && headMonthly !== undefined) {
      const delta = (headMonthly - baseMonthly);
      const deltaSign = delta >= 0 ? '+' : '';
      lines.push(`Base → Head cost: $${baseMonthly.toFixed(2)} → $${headMonthly.toFixed(2)} (Δ ${deltaSign}$${delta.toFixed(2)})`);
    }
    lines.push(colorize('Estimates reflect configuration risk and optimization opportunities.', COLORS.dim));
  } else {
    lines.push(`Files analyzed: ${filesAnalyzed}`);
    if (response.summary.estimatedImpact) {
      lines.push(`Estimated runtime impact: ${response.summary.estimatedImpact}`);
    }
    lines.push(`Traffic model: Default execution bands (10K–100K req/month)`);
    lines.push(colorize('Estimates reflect call and log amplification, not direct infrastructure provisioning.', COLORS.dim));
  }

  return lines;
}

function formatDecision(response: AnalyzeResponse): string {
  const isBlocked = response.decision === 'block';
  return isBlocked 
    ? '🔴 Merge blocked — High-severity cost risk detected'
    : '🟢 No blocking cost issues detected';
}

function formatCostAmplifiers(amplifiers: CostAmplifier[]): string[] {
  if (!amplifiers || amplifiers.length === 0) return [];
  
  const lines: string[] = [];
  lines.push('');
  lines.push(colorize('Toxic Cost Amplifiers', COLORS.bold));
  lines.push(colorize('These are not new findings. They explain how cost may multiply under scale or traffic.', COLORS.dim));
  lines.push('');
  
  for (const amp of amplifiers.slice(0, 5)) {
    const sevColor = amp.severity === 'CRITICAL' ? COLORS.red : COLORS.yellow;
    lines.push(`• ${colorize(amp.title, sevColor, COLORS.bold)}`);
    lines.push(colorize(`  ${amp.description}`, COLORS.dim));
    if (amp.amplification?.factor_range) {
      lines.push(colorize(`  Estimated amplification: ${amp.amplification.factor_range}`, COLORS.cyan));
    }
    lines.push(colorize(`  Confidence: ${amp.confidence}`, COLORS.dim));
    lines.push('');
  }
  
  return lines;
}

function formatNextActions(response: AnalyzeResponse): string[] {
  if (response.findings.length === 0) return [];
  
  const lines: string[] = [colorize('Next steps', COLORS.bold)];
  lines.push('• Review findings above');
  lines.push('• Fix issues locally or acknowledge if intentional');
  lines.push('• Re-run `devx scan` to confirm');

  return lines;
}

export function renderTable(response: AnalyzeResponse): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push(formatAnalysisType(response.analysisType));
  lines.push('');
  
  const costSignal = formatCostSignalSummary(response);
  for (const line of costSignal) {
    lines.push(line);
  }
  lines.push('');
  
  lines.push(colorize('Status', COLORS.bold));
  lines.push(formatDecision(response));
  lines.push('');

  const ampLines = formatCostAmplifiers(response.costAmplifiers || []);
  lines.push(...ampLines);
  
  if (response.findings.length > 0) {
    lines.push(colorize('Findings', COLORS.bold));
    lines.push(colorize(`${'Severity'.padEnd(10)} ${'Issue'.padEnd(30)} ${'Location'.padEnd(30)} ${'Est. impact'}`, COLORS.dim));
    
    const sortedFindings = [...response.findings].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
    
    sortedFindings.forEach((finding, index) => {
      lines.push(...formatFinding(finding, index));
    });
  } else {
    lines.push(colorize('Findings', COLORS.bold));
    if (response.analysisType === 'iac') {
      lines.push('No provisioning-related cost changes detected.');
      lines.push(colorize('This change does not introduce new billed infrastructure resources.', COLORS.dim));
    } else {
      lines.push('No runtime cost amplification patterns detected.');
    }
  }
  lines.push('');
  
  const nextActions = formatNextActions(response);
  if (nextActions.length > 0) {
    for (const line of nextActions) {
      lines.push(line);
    }
    lines.push('');
  }
  
  if (response.usage) {
    lines.push(colorize(
      `Usage: ${response.usage.unitsConsumed} units consumed, ${response.usage.unitsRemaining} remaining`,
      COLORS.dim
    ));
    lines.push('');
  }
  
  return lines.join('\n');
}

export function renderJson(response: AnalyzeResponse): string {
  return JSON.stringify(response, null, 2);
}

export function renderPlain(response: AnalyzeResponse): string {
  const lines: string[] = [];
  
  if (response.analysisType === 'code') {
    lines.push('CloudVerse DevX — Cost Impact Check');
    lines.push('This change may increase runtime cloud cost.');
  } else if (response.analysisType === 'iac') {
    lines.push('CloudVerse DevX — Provisioning Cost Impact (IaC)');
    lines.push('This change introduces infrastructure configuration that may affect cloud cost.');
  } else {
    lines.push('CloudVerse DevX — Cost Impact Check (Code + IaC)');
    lines.push('This change may affect infrastructure and runtime cloud cost.');
  }
  lines.push('');
  
  lines.push(`Files analyzed: ${response.summary.filesAnalyzed} (Code: ${response.summary.codeFiles}, IaC: ${response.summary.iacFiles})`);
  
  if (response.summary.estimatedImpact) {
    lines.push(`Estimated runtime impact: ${response.summary.estimatedImpact}`);
  }
  
  if (response.summary.baseMonthly !== undefined && response.summary.headMonthly !== undefined) {
    const delta = response.summary.headMonthly - response.summary.baseMonthly;
    const sign = delta >= 0 ? '+' : '';
    lines.push(`Cost: $${response.summary.baseMonthly.toFixed(2)} → $${response.summary.headMonthly.toFixed(2)} (${sign}$${delta.toFixed(2)}/mo)`);
  }
  
  lines.push('');
  
  if (response.decision === 'block') {
    lines.push('Status: BLOCKED — High-severity cost risk detected');
  } else if (response.decision === 'warn') {
    lines.push('Status: WARNING — Cost concerns detected');
  } else {
    lines.push('Status: PASS — No blocking cost issues');
  }
  lines.push('');

  if (response.costAmplifiers && response.costAmplifiers.length > 0) {
    lines.push('Toxic Cost Amplifiers:');
    for (const amp of response.costAmplifiers.slice(0, 5)) {
      lines.push(`  • ${amp.title}`);
      lines.push(`    ${amp.description}`);
      if (amp.amplification?.factor_range) {
        lines.push(`    Estimated amplification: ${amp.amplification.factor_range}`);
      }
      lines.push(`    Confidence: ${amp.confidence}`);
      lines.push('');
    }
  }
  
  if (response.findings.length > 0) {
    lines.push('Findings:');
    
    const sortedFindings = [...response.findings].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
    
    for (const finding of sortedFindings) {
      const severity = finding.severity.toUpperCase().padEnd(7);
      const location = `${finding.file}:${finding.line}`;
      lines.push(`  ${severity} ${location} — ${finding.title}`);
      if (finding.message) {
        lines.push(`          Why: ${finding.message}`);
      }
      if (finding.recommendation) {
        lines.push(`          Fix: ${finding.recommendation}`);
      }
      if (finding.costImpact) {
        lines.push(`          Impact: ${finding.costImpact}`);
      }
      lines.push('');
    }
  } else {
    if (response.analysisType === 'iac') {
      lines.push('No provisioning-related cost changes detected.');
    } else {
      lines.push('No runtime cost amplification patterns detected.');
    }
  }
  
  lines.push('');
  
  return lines.join('\n');
}

export function renderQuiet(response: AnalyzeResponse): string {
  if (response.decision === 'pass') {
    return '';
  }
  
  const lines: string[] = [];
  
  if (response.decision === 'block') {
    lines.push('DevX: BLOCKED');
  } else {
    lines.push('DevX: WARNING');
  }
  
  for (const finding of response.findings) {
    lines.push(`  ${finding.severity.toUpperCase()}: ${finding.file}:${finding.line} - ${finding.title}`);
  }
  
  return lines.join('\n');
}
