import * as fs from 'fs';
import { AnalyzeResponse, Finding } from '../api/client';

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri?: string;
  defaultConfiguration: {
    level: 'note' | 'warning' | 'error';
  };
}

interface SarifResult {
  ruleId: string;
  level: 'note' | 'warning' | 'error';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: {
        startLine: number;
        endLine?: number;
      };
    };
  }>;
  fixes?: Array<{
    description: { text: string };
  }>;
}

function severityToLevel(severity: string): 'note' | 'warning' | 'error' {
  switch (severity) {
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'note';
    default: return 'warning';
  }
}

function findingToRule(finding: Finding): SarifRule {
  return {
    id: finding.ruleId,
    name: finding.title,
    shortDescription: { text: finding.message },
    defaultConfiguration: {
      level: severityToLevel(finding.severity),
    },
  };
}

function findingToResult(finding: Finding): SarifResult {
  const result: SarifResult = {
    ruleId: finding.ruleId,
    level: severityToLevel(finding.severity),
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.file },
          region: {
            startLine: finding.line,
            endLine: finding.endLine,
          },
        },
      },
    ],
  };
  
  if (finding.recommendation) {
    result.fixes = [
      {
        description: { text: finding.recommendation },
      },
    ];
  }
  
  return result;
}

export function toSarif(response: AnalyzeResponse): object {
  const uniqueRules = new Map<string, SarifRule>();
  
  for (const finding of response.findings) {
    if (!uniqueRules.has(finding.ruleId)) {
      uniqueRules.set(finding.ruleId, findingToRule(finding));
    }
  }
  
  const run: SarifRun = {
    tool: {
      driver: {
        name: 'CloudVerse DevX',
        version: '1.0.0',
        informationUri: 'https://devx.cloudverse.ai',
        rules: Array.from(uniqueRules.values()),
      },
    },
    results: response.findings.map(findingToResult),
  };
  
  if (!fs.existsSync('devx-results.sarif')) {
    try {
      fs.writeFileSync('devx-results.sarif', JSON.stringify({
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [run],
      }, null, 2));
    } catch (e) {
      // Ignore write errors in CLI mode
    }
  }
  
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [run],
  };
}

export function renderSarif(response: AnalyzeResponse): string {
  return JSON.stringify(toSarif(response), null, 2);
}
