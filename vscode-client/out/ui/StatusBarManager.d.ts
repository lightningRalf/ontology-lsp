/**
 * Status Bar Manager
 * Provides real-time feedback about server status, operations, and insights
 */
import * as vscode from 'vscode';
export declare class StatusBarManager {
    private context;
    private statusBarItem;
    private progressBarItem;
    private statsBarItem;
    private currentStatus;
    private stats;
    constructor(context: vscode.ExtensionContext);
    show(): void;
    hide(): void;
    setActive(message?: string): void;
    setInactive(): void;
    setError(message: string): void;
    setWarning(message: string): void;
    setMessage(message: string, timeout?: number): void;
    setProgress(message: string, percentage?: number): void;
    clearProgress(): void;
    updateStats(stats: Partial<typeof this.stats>): void;
    private updateDisplay;
    dispose(): void;
}
//# sourceMappingURL=StatusBarManager.d.ts.map