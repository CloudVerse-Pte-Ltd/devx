import { Command } from 'commander';
import { startMcpServer } from '../mcp/server';

export function createMcpCommand(): Command {
  const mcp = new Command('mcp');
  
  mcp
    .description('Start the MCP (Model Context Protocol) server for AI agent integration')
    .action(async () => {
      await startMcpServer();
    });

  return mcp;
}
