import { GatingResult } from './gating';
export declare function renderTerminal(result: GatingResult, mode: 'pre-commit' | 'pre-push' | 'manual', error?: {
    type: 'auth' | 'network';
    detail: string;
}): string;
//# sourceMappingURL=terminal.d.ts.map