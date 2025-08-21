/**
 * Configuration Manager
 * Handles all configuration with validation, caching, and migration
 */
import * as vscode from 'vscode';
export declare class ConfigurationManager {
    private context;
    private config;
    private cache;
    private listeners;
    constructor(context: vscode.ExtensionContext);
    initialize(): Promise<void>;
    get<T>(key: string, defaultValue?: T): T;
    set(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void>;
    onDidChange(key: string, callback: (value: any) => void): vscode.Disposable;
    private notifyListeners;
    private validateConfiguration;
    private migrateConfiguration;
    getAll(): Record<string, any>;
}
//# sourceMappingURL=ConfigurationManager.d.ts.map