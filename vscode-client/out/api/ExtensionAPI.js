"use strict";
/**
 * Extension API
 * Public API for third-party extensions to integrate with Ontology LSP
 *
 * Sixth-order consideration: Extensibility for future AI integration and ecosystem growth
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
exports.ExtensionAPI = void 0;
const vscode = __importStar(require("vscode"));
class ExtensionAPI {
    constructor(client, config, telemetry) {
        this.client = client;
        this.config = config;
        this.telemetry = telemetry;
        this.eventEmitter = new vscode.EventEmitter();
        this.customRules = [];
        this.setupEventHandlers();
    }
    async getConcept(uri, position) {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        const result = await this.client.sendRequest('ontology/getConcept', {
            uri,
            position: { line: position.line, character: position.character }
        });
        return result ? this.convertConcept(result) : null;
    }
    async findRelatedConcepts(conceptId) {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        const results = await this.client.sendRequest('ontology/findRelated', {
            conceptId
        });
        return Array.isArray(results) ? results.map((r) => this.convertConcept(r)) : [];
    }
    async getPatterns() {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        return await this.client.sendRequest('ontology/getPatterns', {});
    }
    async trainPattern(pattern) {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        await this.client.sendRequest('ontology/trainPattern', pattern);
        this.telemetry?.logEvent('api.pattern.trained', {
            name: pattern.name
        });
    }
    async suggestRefactorings(uri, position) {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        const results = await this.client.sendRequest('ontology/suggestRefactoring', {
            uri,
            position: { line: position.line, character: position.character }
        });
        return Array.isArray(results) ? results.map((r) => this.convertRefactoring(r)) : [];
    }
    async applyRefactoring(refactoring) {
        const edit = new vscode.WorkspaceEdit();
        for (const change of refactoring.changes) {
            const uri = vscode.Uri.parse(change.uri);
            edit.replace(uri, change.range, change.newText);
        }
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            this.telemetry?.logEvent('api.refactoring.applied', {
                id: refactoring.id,
                title: refactoring.title
            });
        }
        return success;
    }
    registerPropagationRule(rule) {
        this.customRules.push(rule);
        // Register with server
        if (this.client) {
            this.client.sendNotification('ontology/registerRule', {
                name: rule.name,
                description: rule.description
            });
        }
    }
    onConceptDiscovered(callback) {
        return this.client?.onNotification('ontology/conceptDiscovered', (params) => {
            callback(this.convertConcept(params));
        }) || new vscode.Disposable(() => { });
    }
    onPatternLearned(callback) {
        return this.client?.onNotification('ontology/patternLearned', callback)
            || new vscode.Disposable(() => { });
    }
    onRefactoringApplied(callback) {
        return this.eventEmitter.event((e) => {
            if (e.type === 'refactoringApplied') {
                callback(e.data);
            }
        });
    }
    async getStatistics() {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        return await this.client.sendRequest('ontology/getStatistics', {});
    }
    async exportOntology() {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        return await this.client.sendRequest('ontology/export', {});
    }
    async importOntology(data) {
        if (!this.client) {
            throw new Error('Language server not available');
        }
        await this.client.sendRequest('ontology/import', { data });
    }
    setupEventHandlers() {
        if (!this.client)
            return;
        // Setup custom rule processing
        this.client.onRequest('ontology/processCustomRule', async (params) => {
            const change = this.convertChange(params.change);
            for (const rule of this.customRules) {
                if (rule.matcher(change)) {
                    const propagated = await rule.propagate(change);
                    return propagated.map(c => ({
                        uri: c.uri,
                        range: {
                            start: { line: c.range.start.line, character: c.range.start.character },
                            end: { line: c.range.end.line, character: c.range.end.character }
                        },
                        newText: c.newText
                    }));
                }
            }
            return [];
        });
    }
    convertConcept(data) {
        return {
            id: data.id,
            name: data.name,
            type: data.type,
            uri: data.uri,
            range: new vscode.Range(data.range.start.line, data.range.start.character, data.range.end.line, data.range.end.character),
            relationships: data.relationships || [],
            confidence: data.confidence || 1,
            metadata: data.metadata || {}
        };
    }
    convertRefactoring(data) {
        return {
            id: data.id,
            title: data.title,
            description: data.description,
            confidence: data.confidence,
            changes: data.changes.map((c) => this.convertChange(c))
        };
    }
    convertChange(data) {
        return {
            uri: data.uri,
            range: new vscode.Range(data.range.start.line, data.range.start.character, data.range.end.line, data.range.end.character),
            newText: data.newText
        };
    }
    /**
     * Advanced API for AI integration (future-proofing)
     */
    async analyzeWithAI(code, prompt) {
        // Placeholder for future AI integration
        // This would connect to an AI service for advanced analysis
        return {
            analysis: 'AI analysis not yet implemented',
            suggestions: []
        };
    }
    /**
     * Get the raw language client for advanced usage
     */
    getLanguageClient() {
        return this.client;
    }
    /**
     * Get configuration
     */
    getConfiguration() {
        return this.config.getAll();
    }
}
exports.ExtensionAPI = ExtensionAPI;
//# sourceMappingURL=ExtensionAPI.js.map