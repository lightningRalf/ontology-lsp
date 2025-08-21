"use strict";
/**
 * Configuration Manager
 * Handles all configuration with validation, caching, and migration
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
exports.ConfigurationManager = void 0;
const vscode = __importStar(require("vscode"));
class ConfigurationManager {
    constructor(context) {
        this.context = context;
        this.cache = new Map();
        this.listeners = new Map();
        this.config = vscode.workspace.getConfiguration('ontologyLSP');
    }
    async initialize() {
        // Migrate old configurations if needed
        await this.migrateConfiguration();
        // Validate configuration
        this.validateConfiguration();
        // Setup configuration change listener
        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ontologyLSP')) {
                this.config = vscode.workspace.getConfiguration('ontologyLSP');
                this.cache.clear();
                this.notifyListeners();
            }
        }));
    }
    get(key, defaultValue) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        const value = this.config.get(key, defaultValue);
        this.cache.set(key, value);
        return value;
    }
    async set(key, value, target = vscode.ConfigurationTarget.Workspace) {
        await this.config.update(key, value, target);
        this.cache.set(key, value);
        this.notifyListeners(key);
    }
    onDidChange(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
        return new vscode.Disposable(() => {
            const callbacks = this.listeners.get(key);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            }
        });
    }
    notifyListeners(key) {
        if (key) {
            const callbacks = this.listeners.get(key);
            if (callbacks) {
                const value = this.get(key);
                callbacks.forEach(cb => cb(value));
            }
        }
        else {
            // Notify all listeners
            for (const [k, callbacks] of this.listeners) {
                const value = this.get(k);
                callbacks.forEach(cb => cb(value));
            }
        }
    }
    validateConfiguration() {
        // Validate numeric ranges
        const fuzzyThreshold = this.get('fuzzyMatching.threshold');
        if (fuzzyThreshold < 0 || fuzzyThreshold > 1) {
            vscode.window.showWarningMessage('Fuzzy matching threshold must be between 0 and 1');
            this.set('fuzzyMatching.threshold', 0.7);
        }
        const minConfidence = this.get('patternLearning.minConfidence');
        if (minConfidence < 0 || minConfidence > 1) {
            vscode.window.showWarningMessage('Pattern learning confidence must be between 0 and 1');
            this.set('patternLearning.minConfidence', 0.8);
        }
        const maxDepth = this.get('propagation.maxDepth');
        if (maxDepth < 1 || maxDepth > 10) {
            vscode.window.showWarningMessage('Propagation depth must be between 1 and 10');
            this.set('propagation.maxDepth', 3);
        }
    }
    async migrateConfiguration() {
        // Migrate from old configuration keys to new ones
        const migrations = [
            { old: 'ontology.fuzzyMatch', new: 'fuzzyMatching.enabled' },
            { old: 'ontology.learnPatterns', new: 'patternLearning.enabled' },
            { old: 'ontology.autoPropagate', new: 'propagation.autoApply' }
        ];
        for (const migration of migrations) {
            if (this.config.has(migration.old)) {
                const value = this.config.get(migration.old);
                await this.set(migration.new, value);
                await this.config.update(migration.old, undefined, vscode.ConfigurationTarget.Global);
            }
        }
    }
    getAll() {
        return {
            enable: this.get('enable'),
            fuzzyMatching: {
                enabled: this.get('fuzzyMatching.enabled'),
                threshold: this.get('fuzzyMatching.threshold')
            },
            patternLearning: {
                enabled: this.get('patternLearning.enabled'),
                minConfidence: this.get('patternLearning.minConfidence')
            },
            propagation: {
                enabled: this.get('propagation.enabled'),
                autoApply: this.get('propagation.autoApply'),
                maxDepth: this.get('propagation.maxDepth')
            },
            performance: {
                cacheSize: this.get('performance.cacheSize'),
                parallelWorkers: this.get('performance.parallelWorkers')
            },
            ui: {
                showStatusBar: this.get('ui.showStatusBar'),
                showInlineHints: this.get('ui.showInlineHints')
            },
            telemetry: {
                enabled: this.get('telemetry.enabled')
            },
            experimental: {
                aiSuggestions: this.get('experimental.aiSuggestions')
            }
        };
    }
}
exports.ConfigurationManager = ConfigurationManager;
//# sourceMappingURL=ConfigurationManager.js.map