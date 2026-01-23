import { Command } from 'commander';
import { getConfig } from '../config/store';
import { listRebuttals, approveRebuttal, rejectRebuttal, IntentionalFindingData } from '../api/client';

function formatRebuttal(r: IntentionalFindingData): string[] {
  const lines: string[] = [];
  const statusEmoji = r.reviewStatus === 'pending' ? '🟠' : 
                      r.reviewStatus === 'approved' ? '🟢' : 
                      r.reviewStatus === 'rejected' ? '❌' : '⚪';
  
  lines.push(`${statusEmoji} ${r.id.slice(0, 8)}  ${r.ruleId.padEnd(30)}  ${r.severity.padEnd(8)}  ${r.reviewStatus}`);
  lines.push(`   Fingerprint: ${r.fingerprint.slice(0, 16)}...`);
  lines.push(`   Reason: ${r.reason}`);
  lines.push(`   Author: ${r.author}`);
  if (r.appId) {
    lines.push(`   App: ${r.appId}`);
  }
  if (r.expiresAt) {
    const expiresAt = new Date(r.expiresAt);
    const now = new Date();
    const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntil > 0) {
      lines.push(`   Expires in: ${daysUntil} days`);
    } else {
      lines.push(`   Status: Expired`);
    }
  }
  if (r.reviewer) {
    lines.push(`   Reviewed by: ${r.reviewer} at ${r.reviewedAt}`);
  }
  lines.push('');
  return lines;
}

export function createRebuttalCommand(): Command {
  const cmd = new Command('rebuttal')
    .description('Manage intentional finding rebuttals');

  cmd
    .command('list')
    .description('List rebuttals')
    .option('--pending', 'Show only pending rebuttals requiring approval')
    .option('--app <appId>', 'Filter by app ID')
    .action(async (options: { pending?: boolean; app?: string }) => {
      const config = getConfig();

      if (!config.accessToken) {
        console.error('❌ Not authenticated. Run: devx auth login');
        process.exit(3);
      }

      try {
        const result = await listRebuttals({
          pending: options.pending,
          appId: options.app,
        });

        if (result.intentionals.length === 0) {
          if (options.pending) {
            console.log('No pending rebuttals requiring approval.');
          } else {
            console.log('No active rebuttals found.');
          }
          return;
        }

        console.log('');
        if (options.pending) {
          console.log('Pending Rebuttals (require manager approval):');
        } else {
          console.log('Active Rebuttals:');
        }
        console.log('═'.repeat(80));
        console.log('');

        for (const r of result.intentionals) {
          const lines = formatRebuttal(r);
          for (const line of lines) {
            console.log(line);
          }
        }

        console.log(`Total: ${result.intentionals.length} rebuttal(s)`);
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(3);
      }
    });

  cmd
    .command('approve')
    .description('Approve a pending rebuttal (managers only)')
    .argument('<id>', 'Rebuttal ID')
    .action(async (id: string) => {
      const config = getConfig();

      if (!config.accessToken) {
        console.error('❌ Not authenticated. Run: devx auth login');
        process.exit(3);
      }

      try {
        console.log(`Approving rebuttal ${id.slice(0, 8)}...`);
        
        const result = await approveRebuttal(id);

        if (result.success) {
          console.log('🟢 Rebuttal approved');
          console.log(`   ID: ${id.slice(0, 8)}...`);
          console.log('');
          console.log('This suppression is now active and will take effect.');
        } else {
          console.error('❌ Failed to approve rebuttal');
          process.exit(1);
        }
      } catch (error: any) {
        if (error.statusCode === 403) {
          console.error('❌ Permission denied. Only org owners or admins can approve rebuttals.');
        } else {
          console.error(`❌ Error: ${error.message}`);
        }
        process.exit(3);
      }
    });

  cmd
    .command('reject')
    .description('Reject a pending rebuttal (managers only)')
    .argument('<id>', 'Rebuttal ID')
    .action(async (id: string) => {
      const config = getConfig();

      if (!config.accessToken) {
        console.error('❌ Not authenticated. Run: devx auth login');
        process.exit(3);
      }

      try {
        console.log(`Rejecting rebuttal ${id.slice(0, 8)}...`);
        
        const result = await rejectRebuttal(id);

        if (result.success) {
          console.log('❌ Rebuttal rejected');
          console.log(`   ID: ${id.slice(0, 8)}...`);
          console.log('');
          console.log('This suppression has been rejected and the finding will remain active.');
        } else {
          console.error('❌ Failed to reject rebuttal');
          process.exit(1);
        }
      } catch (error: any) {
        if (error.statusCode === 403) {
          console.error('❌ Permission denied. Only org owners or admins can reject rebuttals.');
        } else {
          console.error(`❌ Error: ${error.message}`);
        }
        process.exit(3);
      }
    });

  return cmd;
}
