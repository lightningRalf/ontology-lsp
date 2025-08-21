"use strict";
/**
 * Extension Integration Tests
 * Tests the main extension activation and lifecycle
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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
suite('Extension Integration Test Suite', () => {
    let lspServer;
    suiteSetup(async () => {
        // Start the real LSP server
        const serverPath = path.join(__dirname, '../../../../dist/server.js');
        lspServer = (0, child_process_1.spawn)('node', [serverPath, '--stdio'], {
            cwd: path.join(__dirname, '../../../..'),
            stdio: 'pipe'
        });
        // Give server time to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
    suiteTeardown(() => {
        // Clean up LSP server
        if (lspServer) {
            lspServer.kill();
        }
    });
    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('ontology-team.ontology-lsp'));
    });
    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('ontology-team.ontology-lsp');
        assert.ok(ext);
        const api = await ext.activate();
        assert.ok(api);
        assert.ok(api.getConcept);
        assert.ok(api.getPatterns);
        assert.ok(api.suggestRefactorings);
    });
    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        const expectedCommands = [
            'ontology.enable',
            'ontology.disable',
            'ontology.restart',
            'ontology.showGraph',
            'ontology.analyzeCodebase',
            'ontology.showPatterns',
            'ontology.showStats',
            'ontology.clearCache',
            'ontology.exportOntology',
            'ontology.importOntology',
            'ontology.trainPattern',
            'ontology.suggestRefactoring'
        ];
        for (const cmd of expectedCommands) {
            assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
        }
    });
    test('Configuration should have correct defaults', () => {
        const config = vscode.workspace.getConfiguration('ontologyLSP');
        assert.strictEqual(config.get('enable'), true);
        assert.strictEqual(config.get('fuzzyMatching.enabled'), true);
        assert.strictEqual(config.get('fuzzyMatching.threshold'), 0.7);
        assert.strictEqual(config.get('patternLearning.enabled'), true);
        assert.strictEqual(config.get('propagation.enabled'), true);
        assert.strictEqual(config.get('propagation.autoApply'), false);
    });
    test('Status bar should be visible when enabled', async () => {
        const config = vscode.workspace.getConfiguration('ontologyLSP');
        await config.update('ui.showStatusBar', true, vscode.ConfigurationTarget.Workspace);
        // Give time for status bar to update
        await new Promise(resolve => setTimeout(resolve, 500));
        const statusBarItems = vscode.window.statusBarItems || [];
        const ontologyStatusBar = statusBarItems.find(item => item.text.includes('Ontology'));
        assert.ok(ontologyStatusBar, 'Status bar should be visible');
    });
    test('Language client should connect to server', async () => {
        const ext = vscode.extensions.getExtension('ontology-team.ontology-lsp');
        const api = await ext.activate();
        // Get the language client
        const client = api.getLanguageClient();
        assert.ok(client, 'Language client should exist');
        // Check if client is running
        const state = client.state;
        assert.strictEqual(state, 'running', 'Client should be running');
    });
});
//# sourceMappingURL=extension.test.js.map