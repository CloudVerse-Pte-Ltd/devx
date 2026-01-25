"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpCommand = createMcpCommand;
const commander_1 = require("commander");
const server_1 = require("../mcp/server");
function createMcpCommand() {
    const mcp = new commander_1.Command('mcp');
    mcp
        .description('Start the MCP (Model Context Protocol) server for AI agent integration')
        .action(async () => {
        await (0, server_1.startMcpServer)();
    });
    return mcp;
}
//# sourceMappingURL=mcp.js.map