/**
 * Team Sync Manager
 * Handles sharing of patterns and ontology data across team members
 *
 * Fourth-order consideration: Team collaboration and pattern sharing
 */
import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/ConfigurationManager';
export declare class TeamSyncManager {
    private context;
    private config;
    private syncPath;
    private syncInterval;
    constructor(context: vscode.ExtensionContext, config: ConfigurationManager);
    initialize(): Promise<void>;
    private setupSync;
    saveLocalPatterns(): Promise<void>;
    private loadSharedPatterns;
    private syncWithTeam;
    private getLocalPatterns;
    private isPatternShareable;
    private mergePatterns;
    dispose(): void;
}
//# sourceMappingURL=TeamSyncManager.d.ts.map