/**
 * Telemetry Manager
 * Handles anonymous telemetry with privacy protection
 */
import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/ConfigurationManager';
export declare class TelemetryManager {
    private context;
    private config;
    private enabled;
    private queue;
    constructor(context: vscode.ExtensionContext, config: ConfigurationManager);
    initialize(): Promise<void>;
    logEvent(event: string, properties?: Record<string, any>): void;
    logError(event: string, error: any): void;
    private flushQueue;
    dispose(): Promise<void>;
}
//# sourceMappingURL=TelemetryManager.d.ts.map