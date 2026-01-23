import { GatingResult } from './gating';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function color(text: string, ...codes: string[]): string {
  if (!process.stdout.isTTY) return text;
  return codes.join('') + text + COLORS.reset;
}

export function renderTerminal(
  result: GatingResult,
  mode: 'pre-commit' | 'pre-push' | 'manual',
  error?: { type: 'auth' | 'network'; detail: string }
): string {
  if (error) {
    let out = `${color('DevX', COLORS.bold)}  ⚠️  Unable to run (${error.type === 'auth' ? 'auth' : 'network'})\n`;
    out += `Run: devx auth login\n`;
    out += `Details: ${error.detail}`;
    return out;
  }

  if (result.decision === 'PASS') return '';

  const symbol = result.decision === 'BLOCK' ? '❌' : '⚠️';
  const verdict = result.decision;
  const context = mode === 'pre-commit' ? '(pre-commit)' : mode === 'pre-push' ? '(pre-push)' : '';
  
  let header = `${color('DevX ' + context, COLORS.bold)}  ${symbol}  ${color(verdict, result.decision === 'BLOCK' ? COLORS.red : COLORS.yellow)} — `;
  if (result.decision === 'BLOCK') {
    header += 'high-confidence cost risk';
  } else {
    header += 'cost signals detected (commit allowed)';
  }

  let out = header + '\n';
  out += 'Top findings:\n';

  const topFindings = result.findings
    .sort((a, b) => {
      const sevMap = { high: 3, medium: 2, low: 1 };
      return sevMap[b.severity] - sevMap[a.severity];
    })
    .slice(0, 3);

  topFindings.forEach((f, i) => {
    out += `  ${i + 1}) ${f.title}  (${f.severity.toUpperCase()})  ${f.file}:${f.line}\n`;
    out += `     → ${f.recommendation}\n`;
  });

  if (result.decision === 'BLOCK') {
    out += `Push blocked. Fix findings or bypass: git push --no-verify`;
  } else {
    out += `Run: devx scan --staged --sync   |   Explain: devx explain <RULE_ID>`;
  }

  return out;
}
