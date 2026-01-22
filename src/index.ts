#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth';
import { createScanCommand } from './commands/scan';
import { createHooksCommand, createInstallHooksCommand, createUninstallHooksCommand } from './commands/hooks';
import { createExplainCommand } from './commands/explain';
import { createDoctorCommand } from './commands/doctor';
import * as fs from 'fs';
import * as path from 'path';

function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const program = new Command();
const version = getVersion();

program
  .name('devx')
  .description('CloudVerse DevX CLI - Local cost analysis for developers')
  .version(version);

program.addCommand(createAuthCommand());
program.addCommand(createScanCommand());
program.addCommand(createHooksCommand());
program.addCommand(createInstallHooksCommand());
program.addCommand(createUninstallHooksCommand());
program.addCommand(createExplainCommand());
program.addCommand(createDoctorCommand());

program.parse();
