"use strict";
/**
 * ConfigurationManager Unit Tests
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
const sinon = __importStar(require("sinon"));
const ConfigurationManager_1 = require("../../../config/ConfigurationManager");
suite('ConfigurationManager Test Suite', () => {
    let configManager;
    let context;
    let sandbox;
    setup(() => {
        sandbox = sinon.createSandbox();
        // Mock extension context
        context = {
            subscriptions: [],
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub(),
                keys: sandbox.stub().returns([])
            },
            workspaceState: {
                get: sandbox.stub(),
                update: sandbox.stub(),
                keys: sandbox.stub().returns([])
            }
        };
        configManager = new ConfigurationManager_1.ConfigurationManager(context);
    });
    teardown(() => {
        sandbox.restore();
    });
    test('Should initialize with default configuration', async () => {
        await configManager.initialize();
        assert.strictEqual(configManager.get('enable'), true);
        assert.strictEqual(configManager.get('fuzzyMatching.enabled'), true);
        assert.strictEqual(configManager.get('patternLearning.enabled'), true);
    });
    test('Should cache configuration values', () => {
        const value1 = configManager.get('enable');
        const value2 = configManager.get('enable');
        assert.strictEqual(value1, value2);
        // Should only access config once due to caching
    });
    test('Should validate numeric ranges', async () => {
        await configManager.initialize();
        // Test threshold validation
        await configManager.set('fuzzyMatching.threshold', 1.5);
        const threshold = configManager.get('fuzzyMatching.threshold');
        assert.ok(threshold >= 0 && threshold <= 1, 'Threshold should be clamped to valid range');
        // Test depth validation
        await configManager.set('propagation.maxDepth', 15);
        const depth = configManager.get('propagation.maxDepth');
        assert.ok(depth >= 1 && depth <= 10, 'Depth should be clamped to valid range');
    });
    test('Should notify listeners on configuration change', (done) => {
        let notified = false;
        configManager.onDidChange('enable', (value) => {
            notified = true;
            assert.strictEqual(value, false);
            done();
        });
        configManager.set('enable', false);
    });
    test('Should migrate old configuration keys', async () => {
        // Setup old config
        const config = vscode.workspace.getConfiguration('ontologyLSP');
        sandbox.stub(config, 'has').returns(true);
        sandbox.stub(config, 'get').returns(true);
        const updateStub = sandbox.stub(config, 'update');
        await configManager.initialize();
        // Should have called update to migrate
        assert.ok(updateStub.called);
    });
    test('Should return all configuration as object', () => {
        const allConfig = configManager.getAll();
        assert.ok(allConfig.enable !== undefined);
        assert.ok(allConfig.fuzzyMatching);
        assert.ok(allConfig.patternLearning);
        assert.ok(allConfig.propagation);
        assert.ok(allConfig.performance);
        assert.ok(allConfig.ui);
        assert.ok(allConfig.telemetry);
        assert.ok(allConfig.experimental);
    });
    test('Should handle configuration errors gracefully', async () => {
        // Simulate config error
        sandbox.stub(vscode.workspace, 'getConfiguration').throws(new Error('Config error'));
        // Should not throw
        assert.doesNotThrow(() => {
            new ConfigurationManager_1.ConfigurationManager(context);
        });
    });
    test('Should dispose listeners properly', () => {
        const disposable = configManager.onDidChange('test', () => { });
        assert.ok(disposable);
        // Should not throw
        disposable.dispose();
    });
});
//# sourceMappingURL=ConfigurationManager.test.js.map