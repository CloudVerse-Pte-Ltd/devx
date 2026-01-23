#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const auth_1 = require("./commands/auth");
const scan_1 = require("./commands/scan");
const hooks_1 = require("./commands/hooks");
const explain_1 = require("./commands/explain");
const doctor_1 = require("./commands/doctor");
const accept_1 = require("./commands/accept");
const rebuttal_1 = require("./commands/rebuttal");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function getVersion() {
    try {
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '1.0.0';
    }
    catch {
        return '1.0.0';
    }
}
const program = new commander_1.Command();
const version = getVersion();
program
    .name('devx')
    .description('CloudVerse DevX CLI - Local cost analysis for developers')
    .version(version);
program.addCommand((0, auth_1.createAuthCommand)());
program.addCommand((0, scan_1.createScanCommand)());
program.addCommand((0, hooks_1.createHooksCommand)());
program.addCommand((0, hooks_1.createInstallHooksCommand)());
program.addCommand((0, hooks_1.createUninstallHooksCommand)());
program.addCommand((0, explain_1.createExplainCommand)());
program.addCommand((0, doctor_1.createDoctorCommand)());
program.addCommand((0, accept_1.createAcceptCommand)());
program.addCommand((0, rebuttal_1.createRebuttalCommand)());
program.parse();
//# sourceMappingURL=index.js.map