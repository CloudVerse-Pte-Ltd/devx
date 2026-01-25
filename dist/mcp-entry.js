#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./mcp/server");
(0, server_1.startMcpServer)().catch((error) => {
    process.stderr.write(`Failed to start MCP server: ${error.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=mcp-entry.js.map