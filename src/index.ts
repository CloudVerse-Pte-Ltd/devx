#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth';
import { createScanCommand } from './commands/scan';
import { createHooksCommand, createInstallHooksCommand, createUninstallHooksCommand } from './commands/hooks';
import { createExplainCommand } from './commands/explain';
import { createDoctorCommand } from './commands/doctor';

const program = new Command();

program
  .name('devx')
  .description('CloudVerse DevX CLI - Local cost analysis for developers')
  .version('1.0.0');

program.addCommand(createAuthCommand());
program.addCommand(createScanCommand());
program.addCommand(createHooksCommand());
program.addCommand(createInstallHooksCommand());
program.addCommand(createUninstallHooksCommand());
program.addCommand(createExplainCommand());
program.addCommand(createDoctorCommand());

program.parse();
