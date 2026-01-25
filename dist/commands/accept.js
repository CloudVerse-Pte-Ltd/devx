"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAcceptCommand = createAcceptCommand;
const commander_1 = require("commander");
const store_1 = require("../config/store");
const client_1 = require("../api/client");
function createAcceptCommand() {
    const cmd = new commander_1.Command('accept')
        .description('Mark a finding as intentional (suppress from future scans)')
        .argument('<fingerprint>', 'Finding fingerprint (from scan output)')
        .option('-r, --reason <reason>', 'Reason for marking as intentional', 'Marked as intentional via CLI')
        .option('--expires <days>', 'Auto-expire after N days (default: 30 for HIGH, 180 for MEDIUM/LOW)', (v) => parseInt(v, 10))
        .option('--scope <scope>', 'Suppression scope: line, function, file, resource', 'line')
        .option('--severity <severity>', 'Finding severity: LOW, MEDIUM, HIGH', 'MEDIUM')
        .option('--app <appId>', 'App ID for per-app isolation')
        .action(async (fingerprint, options) => {
        const config = (0, store_1.getConfig)();
        if (!config.accessToken) {
            console.error('❌ Not authenticated. Run: devx auth login');
            process.exit(3);
        }
        if (!config.orgId) {
            console.error('❌ No organization selected. Run: devx auth login');
            process.exit(3);
        }
        try {
            console.log(`Marking finding ${fingerprint.slice(0, 8)}... as intentional`);
            const result = await (0, client_1.acceptFinding)({
                fingerprint,
                reason: options.reason,
                scope: options.scope,
                severity: options.severity,
                appId: options.app,
                expiresInDays: options.expires,
            });
            if (result.success) {
                if (result.requiresApproval) {
                    console.log('🟠 Finding marked as intentional (pending manager approval)');
                    console.log(`   Fingerprint: ${fingerprint.slice(0, 8)}...`);
                    console.log(`   Reason: ${options.reason}`);
                    console.log('');
                    console.log('This suppression requires manager approval due to abuse limits.');
                    console.log('A manager (org owner or admin) must approve it to take effect.');
                }
                else {
                    console.log('🟢 Finding marked as intentional');
                    console.log(`   Fingerprint: ${fingerprint.slice(0, 8)}...`);
                    console.log(`   Reason: ${options.reason}`);
                    if (result.intentional?.expiresAt) {
                        const expiresAt = new Date(result.intentional.expiresAt);
                        const daysUntil = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                        console.log(`   Expires in: ${daysUntil} days`);
                    }
                    console.log('');
                    console.log('This finding will be suppressed in future scans.');
                }
                console.log('');
                console.log('To annotate your code (optional):');
                console.log(`   # devx: intentional ${fingerprint.slice(0, 8)}`);
            }
            else {
                console.error('❌ Failed to mark finding as intentional');
                process.exit(1);
            }
        }
        catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(3);
        }
    });
    return cmd;
}
//# sourceMappingURL=accept.js.map