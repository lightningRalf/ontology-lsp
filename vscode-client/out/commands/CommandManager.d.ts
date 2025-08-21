/**
 * Command Manager
 * Handles all VS Code commands with sophisticated error handling and user feedback
 */
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ConfigurationManager } from '../config/ConfigurationManager';
export declare class CommandManager {
    private context;
    private client;
    private config;
    private commands;
    constructor(context: vscode.ExtensionContext, client: LanguageClient | undefined, config: ConfigurationManager);
    registerCommands(): Promise<void>;
    private registerCommand;
    private enableExtension;
    private disableExtension;
    private restartServer;
    private analyzeCodebase;
    private showConceptGraph;
    private showLearnedPatterns;
    private showStatistics;
    private clearCache;
    private exportOntology;
    private importOntology;
    private trainPattern;
    private suggestRefactoring;
    private applyRefactoring;
    private getGraphHtml;
    private formatPatterns;
    dispose(): void;
}
//# sourceMappingURL=CommandManager.d.ts.map