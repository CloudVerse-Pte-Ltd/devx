"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSarif = toSarif;
exports.renderSarif = renderSarif;
function severityToLevel(severity) {
    switch (severity) {
        case 'high': return 'error';
        case 'medium': return 'warning';
        case 'low': return 'note';
        default: return 'warning';
    }
}
function findingToRule(finding) {
    return {
        id: finding.ruleId,
        name: finding.title,
        shortDescription: { text: finding.message },
        defaultConfiguration: {
            level: severityToLevel(finding.severity),
        },
    };
}
function findingToResult(finding) {
    const result = {
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
function toSarif(response) {
    const uniqueRules = new Map();
    for (const finding of response.findings) {
        if (!uniqueRules.has(finding.ruleId)) {
            uniqueRules.set(finding.ruleId, findingToRule(finding));
        }
    }
    const run = {
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
    return {
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [run],
    };
}
function renderSarif(response) {
    return JSON.stringify(toSarif(response), null, 2);
}
//# sourceMappingURL=sarif.js.map