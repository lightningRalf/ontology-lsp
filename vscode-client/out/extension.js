"use strict";
/**
 * Ontology LSP VS Code Extension
 *
 * Architecture considerations:
 * - First-order: Basic LSP protocol implementation
 * - Second-order: Performance monitoring, conflict resolution with built-in TS server
 * - Third-order: Memory management, pattern validation, cross-file dependencies
 * - Fourth-order: Team collaboration, repository integration, CI/CD hooks
 * - Fifth-order: Security (pattern privacy), scalability (large codebases)
 * - Sixth-order: AI integration readiness, extensibility for future features
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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
const ConfigurationManager_1 = require("./config/ConfigurationManager");
const StatusBarManager_1 = require("./ui/StatusBarManager");
const CommandManager_1 = require("./commands/CommandManager");
const TelemetryManager_1 = require("./telemetry/TelemetryManager");
const OntologyViewProvider_1 = require("./views/OntologyViewProvider");
const GraphWebviewProvider_1 = require("./webview/GraphWebviewProvider");
const ExtensionAPI_1 = require("./api/ExtensionAPI");
const PerformanceMonitor_1 = require("./monitoring/PerformanceMonitor");
const ConflictResolver_1 = require("./integration/ConflictResolver");
const SecurityManager_1 = require("./security/SecurityManager");
const TeamSyncManager_1 = require("./collaboration/TeamSyncManager");
let client;
let statusBar;
let configManager;
let commandManager;
let telemetry;
let performanceMonitor;
let conflictResolver;
let securityManager;
let teamSync;
// Extension API for third-party integration
let extensionAPI;
async function activate(context) {
    console.log('[Ontology LSP] Extension activating...');
    try {
        // Initialize configuration manager first
        configManager = new ConfigurationManager_1.ConfigurationManager(context);
        await configManager.initialize();
        // Check if we're in test mode
        const isTestMode = process.env.VSCODE_TEST === '1' || process.env.NODE_ENV === 'test';
        // Check if extension is enabled
        if (!configManager.get('enable')) {
            console.log('[Ontology LSP] Extension is disabled by configuration');
            return createMinimalAPI();
        }
        // Initialize security manager (handles sensitive pattern filtering)
        securityManager = new SecurityManager_1.SecurityManager(configManager);
        await securityManager.initialize();
        // Initialize performance monitor
        performanceMonitor = new PerformanceMonitor_1.PerformanceMonitor(context);
        performanceMonitor.start();
        // Initialize telemetry (respects user privacy settings)
        telemetry = new TelemetryManager_1.TelemetryManager(context, configManager);
        if (configManager.get('telemetry.enabled')) {
            await telemetry.initialize();
        }
        // Initialize status bar
        statusBar = new StatusBarManager_1.StatusBarManager(context);
        if (configManager.get('ui.showStatusBar')) {
            statusBar.show();
        }
        // Initialize conflict resolver (handles TypeScript server conflicts)
        conflictResolver = new ConflictResolver_1.ConflictResolver(context);
        await conflictResolver.resolveConflicts();
        // Initialize team sync manager (handles shared patterns)
        teamSync = new TeamSyncManager_1.TeamSyncManager(context, configManager);
        await teamSync.initialize();
        // Setup the language server
        const serverModule = getServerPath(context);
        const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
        // Server options with automatic restart on crash
        const serverOptions = {
            run: {
                module: serverModule,
                transport: node_1.TransportKind.stdio,
                options: {
                    cwd: context.extensionPath,
                    env: {
                        ...process.env,
                        ONTOLOGY_EXTENSION_MODE: 'production',
                        ONTOLOGY_SECURITY_LEVEL: securityManager.getSecurityLevel()
                    }
                }
            },
            debug: {
                module: serverModule,
                transport: node_1.TransportKind.stdio,
                options: {
                    ...debugOptions,
                    cwd: context.extensionPath,
                    env: {
                        ...process.env,
                        ONTOLOGY_EXTENSION_MODE: 'debug',
                        ONTOLOGY_SECURITY_LEVEL: securityManager.getSecurityLevel()
                    }
                }
            }
        };
        // Client options with comprehensive document selectors
        const clientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', language: 'typescriptreact' },
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'javascriptreact' },
                { scheme: 'file', language: 'python' },
                { scheme: 'untitled', language: 'typescript' },
                { scheme: 'untitled', language: 'javascript' },
                { scheme: 'untitled', language: 'python' }
            ],
            synchronize: {
                // Synchronize configuration changes
                configurationSection: 'ontologyLSP',
                // Watch for .ontology config files
                fileEvents: [
                    vscode.workspace.createFileSystemWatcher('**/.ontology'),
                    vscode.workspace.createFileSystemWatcher('**/.ontologyignore'),
                    vscode.workspace.createFileSystemWatcher('**/ontology.config.{json,yaml,yml}')
                ]
            },
            // Control output channel
            revealOutputChannelOn: node_1.RevealOutputChannelOn.Error,
            // Middleware for intercepting requests/responses
            middleware: {
                // Intercept completion requests to add AI suggestions if enabled
                provideCompletionItem: async (document, position, context, token, next) => {
                    performanceMonitor.startTimer('completion');
                    const result = await next(document, position, context, token);
                    performanceMonitor.endTimer('completion');
                    if (configManager.get('experimental.aiSuggestions')) {
                        // Enhance with AI suggestions
                        return enhanceWithAISuggestions(result);
                    }
                    return result;
                },
                // Intercept rename requests to handle propagation
                provideRenameEdits: async (document, position, newName, token, next) => {
                    performanceMonitor.startTimer('rename');
                    const result = await next(document, position, newName, token);
                    performanceMonitor.endTimer('rename');
                    if (configManager.get('propagation.enabled')) {
                        // Add propagated changes
                        return addPropagatedChanges(result || undefined, document, position, newName);
                    }
                    return result;
                }
            },
            // Error handler with automatic recovery
            errorHandler: {
                error: (error, message, count) => {
                    telemetry.logError('LSP error', error);
                    statusBar.setError(`LSP Error: ${error.message}`);
                    // Implement exponential backoff for retries
                    if (count && count < 5) {
                        return { action: 'restart', delay: Math.pow(2, count) * 1000 };
                    }
                    return { action: node_1.ErrorAction.Shutdown };
                },
                closed: () => {
                    telemetry.logEvent('LSP connection closed');
                    statusBar.setInactive();
                    // Auto-restart after unexpected closure
                    setTimeout(() => {
                        client?.start();
                    }, 5000);
                    return { action: node_1.CloseAction.Restart };
                }
            }
        };
        // Skip server connection in test mode unless explicitly enabled
        if (!isTestMode || process.env.ONTOLOGY_TEST_WITH_SERVER === 'true') {
            // Create the language client
            client = new node_1.LanguageClient('ontologyLSP', 'Ontology Language Server', serverOptions, clientOptions);
            // Register client capabilities
            client.registerProposedFeatures();
            // Start the client
            await client.start();
            // Setup post-initialization features
            await setupPostInitialization(context);
        }
        // Initialize command manager with client reference
        commandManager = new CommandManager_1.CommandManager(context, client, configManager);
        await commandManager.registerCommands();
        // Initialize views
        const ontologyProvider = new OntologyViewProvider_1.OntologyViewProvider(context, client);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('ontologyExplorer', ontologyProvider));
        // Initialize webview for graph visualization
        const graphProvider = new GraphWebviewProvider_1.GraphWebviewProvider(context, client);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider('ontologyGraph', graphProvider));
        // Setup configuration change listener
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('ontologyLSP')) {
                await handleConfigurationChange(e);
            }
        }));
        // Setup workspace change listeners for learning
        if (configManager.get('patternLearning.enabled')) {
            setupPatternLearning(context);
        }
        // Create and return extension API
        extensionAPI = new ExtensionAPI_1.ExtensionAPI(client, configManager, telemetry);
        // Log successful activation
        telemetry.logEvent('extension.activated', {
            version: context.extension.packageJSON.version,
            mode: context.extensionMode === vscode.ExtensionMode.Development ? 'dev' : 'prod'
        });
        statusBar.setActive('Ontology LSP Ready');
        console.log('[Ontology LSP] Extension activated successfully');
        return extensionAPI;
    }
    catch (error) {
        console.error('[Ontology LSP] Failed to activate extension:', error);
        telemetry?.logError('activation.failed', error);
        vscode.window.showErrorMessage(`Failed to activate Ontology LSP: ${error}`);
        throw error;
    }
}
async function deactivate() {
    console.log('[Ontology LSP] Extension deactivating...');
    try {
        // Save learned patterns before shutdown
        if (teamSync) {
            await teamSync.saveLocalPatterns();
        }
        // Cleanup telemetry
        if (telemetry) {
            telemetry.logEvent('extension.deactivated');
            await telemetry.dispose();
        }
        // Stop performance monitoring
        performanceMonitor?.stop();
        // Cleanup status bar
        statusBar?.dispose();
        // Stop the language client
        if (client) {
            await client.stop();
        }
        console.log('[Ontology LSP] Extension deactivated successfully');
    }
    catch (error) {
        console.error('[Ontology LSP] Error during deactivation:', error);
    }
}
/**
 * Get the server module path, considering custom paths and bundled server
 */
function getServerPath(context) {
    const customPath = configManager.get('server.path');
    if (customPath) {
        return path.isAbsolute(customPath) ? customPath : path.join(context.extensionPath, customPath);
    }
    // Try multiple locations for the server
    const serverLocations = [
        path.join(context.extensionPath, 'server.js'), // In extension directory
        path.join(context.extensionPath, 'dist', 'server.js'), // In extension dist
        '/home/lightningralf/programming/ontology-lsp/dist/server.js' // Absolute fallback
    ];
    const fs = require('fs');
    for (const location of serverLocations) {
        if (fs.existsSync(location)) {
            console.log(`[Ontology LSP] Found server at: ${location}`);
            return location;
        }
    }
    // Default fallback
    console.error('[Ontology LSP] Server not found in expected locations');
    return serverLocations[0];
}
/**
 * Setup post-initialization features that require server connection
 */
async function setupPostInitialization(context) {
    if (!client)
        return;
    // Register custom notifications from server
    client.onNotification('ontology/patternLearned', (params) => {
        if (configManager.get('ui.showStatusBar')) {
            statusBar.setMessage(`Pattern learned: ${params.pattern}`);
        }
        telemetry.logEvent('pattern.learned', params);
    });
    client.onNotification('ontology/conceptDiscovered', (params) => {
        telemetry.logEvent('concept.discovered', params);
    });
    client.onNotification('ontology/performanceWarning', (params) => {
        vscode.window.showWarningMessage(`Performance warning: ${params.message}`);
        performanceMonitor.logWarning(params);
    });
    // Setup progress reporting with proper ProgressType
    const progressType = 'ontology/analyzing';
    client.onProgress(progressType, 'begin', (params) => {
        statusBar.setProgress('Analyzing codebase...', params.percentage);
    });
    client.onProgress(progressType, 'report', (params) => {
        statusBar.setProgress(params.message, params.percentage);
    });
    client.onProgress(progressType, 'end', () => {
        statusBar.clearProgress();
    });
}
/**
 * Handle configuration changes
 */
async function handleConfigurationChange(e) {
    if (!client)
        return;
    // Notify server of configuration change
    await client.sendNotification(node_1.DidChangeConfigurationNotification.type, {
        settings: vscode.workspace.getConfiguration('ontologyLSP')
    });
    // Handle specific configuration changes
    if (e.affectsConfiguration('ontologyLSP.enable')) {
        const enabled = configManager.get('enable');
        if (enabled && client.state === node_1.State.Stopped) {
            await client.start();
        }
        else if (!enabled && client.state === node_1.State.Running) {
            await client.stop();
        }
    }
    if (e.affectsConfiguration('ontologyLSP.ui.showStatusBar')) {
        if (configManager.get('ui.showStatusBar')) {
            statusBar.show();
        }
        else {
            statusBar.hide();
        }
    }
    if (e.affectsConfiguration('ontologyLSP.telemetry.enabled')) {
        if (configManager.get('telemetry.enabled')) {
            await telemetry.initialize();
        }
        else {
            await telemetry.dispose();
        }
    }
}
/**
 * Setup pattern learning from user actions
 */
function setupPatternLearning(context) {
    // Track rename operations for pattern learning
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(async (e) => {
        for (const file of e.files) {
            await client?.sendNotification('ontology/fileRenamed', {
                oldUri: file.oldUri.toString(),
                newUri: file.newUri.toString()
            });
        }
    }));
    // Track text edits for pattern learning
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async (e) => {
        if (e.contentChanges.length > 0 && e.document.languageId) {
            const changes = e.contentChanges.map(change => ({
                range: client?.code2ProtocolConverter.asRange(change.range),
                text: change.text
            }));
            await client?.sendNotification('ontology/documentChanged', {
                uri: e.document.uri.toString(),
                changes
            });
        }
    }));
}
/**
 * Enhance completion items with AI suggestions
 */
async function enhanceWithAISuggestions(items) {
    // This would integrate with an AI service
    // For now, just return the original items
    return items;
}
/**
 * Add propagated changes to rename results
 */
async function addPropagatedChanges(workspaceEdit, document, position, newName) {
    if (!workspaceEdit || !client)
        return workspaceEdit;
    // Request propagated changes from server
    const propagated = await client.sendRequest('ontology/getPropagatedChanges', {
        uri: document.uri.toString(),
        position: client.code2ProtocolConverter.asPosition(position),
        newName
    });
    // Add propagated changes to workspace edit
    if (propagated && Array.isArray(propagated)) {
        for (const change of propagated) {
            const uri = vscode.Uri.parse(change.uri);
            const range = client.protocol2CodeConverter.asRange(change.range);
            workspaceEdit.replace(uri, range || new vscode.Range(0, 0, 0, 0), change.newText);
        }
    }
    return workspaceEdit;
}
/**
 * Create minimal API when extension is disabled
 */
function createMinimalAPI() {
    return new ExtensionAPI_1.ExtensionAPI(undefined, configManager, undefined);
}
//# sourceMappingURL=extension.js.map