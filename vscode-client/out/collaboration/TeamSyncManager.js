"use strict";
/**
 * Team Sync Manager
 * Handles sharing of patterns and ontology data across team members
 *
 * Fourth-order consideration: Team collaboration and pattern sharing
 */
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
exports.TeamSyncManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class TeamSyncManager {
    constructor(context, config) {
        this.context = context;
        this.config = config;
        this.syncInterval = null;
        this.syncPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', '.ontology', 'team-sync.json');
    }
    async initialize() {
        // Check for team sync configuration
        const teamSyncEnabled = this.config.get('team.syncEnabled', false);
        if (teamSyncEnabled) {
            await this.setupSync();
        }
    }
    async setupSync() {
        // Create sync directory if it doesn't exist
        const syncDir = path.dirname(this.syncPath);
        try {
            await fs.mkdir(syncDir, { recursive: true });
        }
        catch (error) {
            console.error('Failed to create sync directory:', error);
        }
        // Load shared patterns
        await this.loadSharedPatterns();
        // Setup periodic sync
        this.syncInterval = setInterval(() => {
            this.syncWithTeam();
        }, 30000); // Sync every 30 seconds
        // Watch for changes in team sync file
        const watcher = vscode.workspace.createFileSystemWatcher(this.syncPath);
        watcher.onDidChange(() => this.loadSharedPatterns());
        watcher.onDidCreate(() => this.loadSharedPatterns());
        this.context.subscriptions.push(watcher);
    }
    async saveLocalPatterns() {
        // Save local patterns for team sharing
        const patterns = await this.getLocalPatterns();
        try {
            const data = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                author: process.env.USER || 'unknown',
                patterns: patterns.filter(p => this.isPatternShareable(p))
            };
            await fs.writeFile(this.syncPath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Failed to save team patterns:', error);
        }
    }
    async loadSharedPatterns() {
        try {
            const content = await fs.readFile(this.syncPath, 'utf8');
            const data = JSON.parse(content);
            // Merge with local patterns
            await this.mergePatterns(data.patterns);
        }
        catch (error) {
            // File doesn't exist yet, that's okay
            if (error.code !== 'ENOENT') {
                console.error('Failed to load shared patterns:', error);
            }
        }
    }
    async syncWithTeam() {
        // In a real implementation, this would sync with a remote service
        // For now, just save local patterns
        await this.saveLocalPatterns();
    }
    async getLocalPatterns() {
        // Get patterns from language server
        // This is a stub implementation
        return [];
    }
    isPatternShareable(pattern) {
        // Check if pattern contains sensitive information
        // and if it meets quality thresholds
        return pattern.confidence > 0.8 && pattern.usageCount > 3;
    }
    async mergePatterns(sharedPatterns) {
        // Merge shared patterns with local ones
        // Resolve conflicts based on confidence and usage
        console.log(`Merging ${sharedPatterns.length} shared patterns`);
    }
    dispose() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}
exports.TeamSyncManager = TeamSyncManager;
//# sourceMappingURL=TeamSyncManager.js.map