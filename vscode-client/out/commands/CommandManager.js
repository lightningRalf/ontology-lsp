"use strict";
/**
 * Command Manager
 * Handles all VS Code commands with sophisticated error handling and user feedback
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
exports.CommandManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const node_1 = require("vscode-languageclient/node");
class CommandManager {
    constructor(context, client, config) {
        this.context = context;
        this.client = client;
        this.config = config;
        this.commands = new Map();
    }
    async registerCommands() {
        // Core commands
        this.registerCommand('ontology.enable', this.enableExtension);
        this.registerCommand('ontology.disable', this.disableExtension);
        this.registerCommand('ontology.restart', this.restartServer);
        // Analysis commands
        this.registerCommand('ontology.analyzeCodebase', this.analyzeCodebase);
        this.registerCommand('ontology.showGraph', this.showConceptGraph);
        this.registerCommand('ontology.showPatterns', this.showLearnedPatterns);
        this.registerCommand('ontology.showStats', this.showStatistics);
        // Management commands
        this.registerCommand('ontology.clearCache', this.clearCache);
        this.registerCommand('ontology.exportOntology', this.exportOntology);
        this.registerCommand('ontology.importOntology', this.importOntology);
        // Learning commands
        this.registerCommand('ontology.trainPattern', this.trainPattern);
        this.registerCommand('ontology.suggestRefactoring', this.suggestRefactoring);
    }
    registerCommand(command, handler) {
        const disposable = vscode.commands.registerCommand(command, handler.bind(this));
        this.commands.set(command, disposable);
        this.context.subscriptions.push(disposable);
    }
    async enableExtension() {
        await this.config.set('enable', true);
        if (this.client?.state === node_1.State.Stopped) {
            await this.client.start();
        }
        vscode.window.showInformationMessage('Ontology LSP enabled');
    }
    async disableExtension() {
        await this.config.set('enable', false);
        if (this.client?.state === node_1.State.Running) {
            await this.client.stop();
        }
        vscode.window.showInformationMessage('Ontology LSP disabled');
    }
    async restartServer() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not initialized');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Restarting Ontology Language Server',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Stopping server...' });
            await this.client.stop();
            progress.report({ increment: 50, message: 'Starting server...' });
            await this.client.start();
            progress.report({ increment: 100, message: 'Server restarted' });
        });
        vscode.window.showInformationMessage('Ontology Language Server restarted');
    }
    async analyzeCodebase() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing Codebase',
            cancellable: true
        }, async (progress, token) => {
            try {
                const result = await this.client.sendRequest('ontology/analyzeWorkspace', {
                    folders: folders.map(f => f.uri.toString()),
                    cancellationToken: token
                });
                if (result && typeof result === 'object') {
                    const resultObj = result;
                    vscode.window.showInformationMessage(`Analysis complete: ${resultObj.concepts || 0} concepts, ${resultObj.patterns || 0} patterns discovered`);
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            }
        });
    }
    async showConceptGraph() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        // Create webview panel for graph visualization
        const panel = vscode.window.createWebviewPanel('ontologyGraph', 'Ontology Concept Graph', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        // Get graph data from server
        const graphData = await this.client.sendRequest('ontology/getConceptGraph', {});
        // Generate HTML with D3.js visualization
        panel.webview.html = this.getGraphHtml(graphData);
    }
    async showLearnedPatterns() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const patterns = await this.client.sendRequest('ontology/getPatterns', {});
        // Create virtual document to show patterns
        const content = this.formatPatterns(Array.isArray(patterns) ? patterns : []);
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
    }
    async showStatistics() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const stats = await this.client.sendRequest('ontology/getStatistics', {});
        // Show statistics in output channel
        const output = vscode.window.createOutputChannel('Ontology Statistics');
        output.clear();
        output.appendLine('=== Ontology LSP Statistics ===\n');
        output.appendLine(`Concepts: ${stats?.concepts || 0}`);
        output.appendLine(`Relationships: ${stats?.relationships || 0}`);
        output.appendLine(`Learned Patterns: ${stats?.patterns || 0}`);
        output.appendLine(`Cache Hit Rate: ${stats?.cacheHitRate || 0}%`);
        output.appendLine(`Average Response Time: ${stats?.avgResponseTime || 0}ms`);
        output.appendLine(`Memory Usage: ${stats?.memoryUsage || 0}MB`);
        output.appendLine('\n=== Recent Operations ===');
        for (const op of stats?.recentOperations || []) {
            output.appendLine(`${op.timestamp}: ${op.type} (${op.duration}ms)`);
        }
        output.show();
    }
    async clearCache() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const confirm = await vscode.window.showWarningMessage('Clear all ontology cache? This will reset learned patterns.', 'Yes', 'No');
        if (confirm === 'Yes') {
            await this.client.sendRequest('ontology/clearCache', {});
            vscode.window.showInformationMessage('Ontology cache cleared');
        }
    }
    async exportOntology() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('ontology-export.json'),
            filters: {
                'JSON': ['json'],
                'YAML': ['yaml', 'yml']
            }
        });
        if (!uri)
            return;
        const data = await this.client.sendRequest('ontology/export', {});
        const content = JSON.stringify(data, null, 2);
        await fs.writeFile(uri.fsPath, content, 'utf8');
        vscode.window.showInformationMessage(`Ontology exported to ${uri.fsPath}`);
    }
    async importOntology() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Ontology Files': ['json', 'yaml', 'yml']
            }
        });
        if (!uri || uri.length === 0)
            return;
        const content = await fs.readFile(uri[0].fsPath, 'utf8');
        const data = JSON.parse(content);
        await this.client.sendRequest('ontology/import', { data });
        vscode.window.showInformationMessage('Ontology imported successfully');
    }
    async trainPattern() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.selection) {
            vscode.window.showWarningMessage('Select code to train pattern');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const text = document.getText(selection);
        const patternName = await vscode.window.showInputBox({
            prompt: 'Enter pattern name',
            placeHolder: 'e.g., getter-setter-sync'
        });
        if (!patternName)
            return;
        const description = await vscode.window.showInputBox({
            prompt: 'Describe the pattern',
            placeHolder: 'e.g., Synchronize getter and setter names'
        });
        await this.client.sendRequest('ontology/trainPattern', {
            name: patternName,
            description,
            code: text,
            uri: document.uri.toString(),
            range: {
                start: { line: selection.start.line, character: selection.start.character },
                end: { line: selection.end.line, character: selection.end.character }
            }
        });
        vscode.window.showInformationMessage(`Pattern "${patternName}" trained successfully`);
    }
    async suggestRefactoring() {
        if (!this.client) {
            vscode.window.showErrorMessage('Language server not running');
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const document = editor.document;
        const position = editor.selection.active;
        const suggestions = await this.client.sendRequest('ontology/suggestRefactoring', {
            uri: document.uri.toString(),
            position: { line: position.line, character: position.character }
        });
        const suggestionsArray = Array.isArray(suggestions) ? suggestions : [];
        if (suggestionsArray.length === 0) {
            vscode.window.showInformationMessage('No refactoring suggestions available');
            return;
        }
        const items = suggestionsArray.map((s) => ({
            label: s.title,
            description: s.description,
            detail: `Confidence: ${Math.round((s.confidence || 0) * 100)}%`,
            suggestion: s
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a refactoring suggestion'
        });
        if (selected) {
            await this.applyRefactoring(selected.suggestion);
        }
    }
    async applyRefactoring(suggestion) {
        const edit = new vscode.WorkspaceEdit();
        for (const change of suggestion.changes) {
            const uri = vscode.Uri.parse(change.uri);
            const range = new vscode.Range(change.range.start.line, change.range.start.character, change.range.end.line, change.range.end.character);
            edit.replace(uri, range, change.newText);
        }
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            vscode.window.showInformationMessage('Refactoring applied successfully');
        }
        else {
            vscode.window.showErrorMessage('Failed to apply refactoring');
        }
    }
    getGraphHtml(data) {
        return `<!DOCTYPE html>
        <html>
        <head>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <style>
                body { margin: 0; overflow: hidden; }
                .node { cursor: pointer; }
                .link { fill: none; stroke: #999; stroke-opacity: 0.6; stroke-width: 2px; }
                .node-label { font: 12px sans-serif; pointer-events: none; }
            </style>
        </head>
        <body>
            <svg id="graph"></svg>
            <script>
                const data = ${JSON.stringify(data)};
                // D3.js force-directed graph implementation
                // ... (full implementation would go here)
            </script>
        </body>
        </html>`;
    }
    formatPatterns(patterns) {
        let content = '# Learned Patterns\n\n';
        for (const pattern of patterns) {
            content += `## ${pattern.name}\n\n`;
            content += `**Description:** ${pattern.description}\n\n`;
            content += `**Confidence:** ${Math.round(pattern.confidence * 100)}%\n\n`;
            content += `**Usage Count:** ${pattern.usageCount}\n\n`;
            content += `**Example:**\n\`\`\`\n${pattern.example}\n\`\`\`\n\n`;
            content += '---\n\n';
        }
        return content;
    }
    dispose() {
        for (const disposable of this.commands.values()) {
            disposable.dispose();
        }
        this.commands.clear();
    }
}
exports.CommandManager = CommandManager;
//# sourceMappingURL=CommandManager.js.map