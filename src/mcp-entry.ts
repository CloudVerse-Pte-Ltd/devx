#!/usr/bin/env node

import { startMcpServer } from './mcp/server';

startMcpServer().catch((error) => {
  process.stderr.write(`Failed to start MCP server: ${error.message}\n`);
  process.exit(1);
});
