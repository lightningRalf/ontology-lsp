"use strict";
/**
 * PerformanceMonitor Unit Tests
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
const sinon = __importStar(require("sinon"));
const vscode = __importStar(require("vscode"));
const PerformanceMonitor_1 = require("../../../monitoring/PerformanceMonitor");
suite('PerformanceMonitor Test Suite', () => {
    let performanceMonitor;
    let context;
    let sandbox;
    let outputChannel;
    setup(() => {
        sandbox = sinon.createSandbox();
        // Mock output channel
        outputChannel = {
            appendLine: sandbox.spy(),
            clear: sandbox.spy(),
            show: sandbox.spy()
        };
        sandbox.stub(vscode.window, 'createOutputChannel').returns(outputChannel);
        // Mock extension context
        context = {
            subscriptions: [],
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub()
            }
        };
        // Mock performance.now()
        let time = 0;
        sandbox.stub(performance, 'now').callsFake(() => {
            return time++;
        });
        performanceMonitor = new PerformanceMonitor_1.PerformanceMonitor(context);
    });
    teardown(() => {
        performanceMonitor.stop();
        sandbox.restore();
    });
    test('Should start and stop monitoring', () => {
        performanceMonitor.start();
        // Should register command
        assert.ok(context.subscriptions.length > 0);
        performanceMonitor.stop();
        // Should not throw
    });
    test('Should track timer operations', () => {
        performanceMonitor.startTimer('test-operation');
        const duration = performanceMonitor.endTimer('test-operation');
        assert.ok(duration >= 0);
    });
    test('Should track multiple concurrent timers', () => {
        performanceMonitor.startTimer('operation1');
        performanceMonitor.startTimer('operation2');
        const duration1 = performanceMonitor.endTimer('operation1');
        const duration2 = performanceMonitor.endTimer('operation2');
        assert.ok(duration1 >= 0);
        assert.ok(duration2 >= 0);
    });
    test('Should handle ending non-existent timer', () => {
        const consoleSpy = sandbox.spy(console, 'warn');
        const duration = performanceMonitor.endTimer('non-existent');
        assert.strictEqual(duration, 0);
        assert.ok(consoleSpy.called);
    });
    test('Should detect slow operations', () => {
        // Mock slow operation (>1000ms)
        let time = 0;
        performance.now.callsFake(() => {
            const result = time;
            time += 2000;
            return result;
        });
        performanceMonitor.startTimer('slow-op');
        performanceMonitor.endTimer('slow-op');
        assert.ok(outputChannel.appendLine.called);
        const call = outputChannel.appendLine.firstCall.args[0];
        assert.ok(call.includes('[SLOW]'));
        assert.ok(call.includes('slow-op'));
    });
    test('Should show warning for very slow operations', async () => {
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');
        // Mock very slow operation (>5000ms)
        let time = 0;
        performance.now.callsFake(() => {
            const result = time;
            time += 6000;
            return result;
        });
        performanceMonitor.startTimer('very-slow-op');
        performanceMonitor.endTimer('very-slow-op');
        assert.ok(showWarningStub.called);
    });
    test('Should measure async operations', async () => {
        const result = await performanceMonitor.measureAsync('async-op', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'result';
        });
        assert.strictEqual(result, 'result');
        const stats = performanceMonitor.getStatistics('async-op');
        assert.ok(stats);
        assert.ok(stats.count > 0);
    });
    test('Should measure sync operations', () => {
        const result = performanceMonitor.measure('sync-op', () => {
            return 42;
        });
        assert.strictEqual(result, 42);
        const stats = performanceMonitor.getStatistics('sync-op');
        assert.ok(stats);
        assert.ok(stats.count > 0);
    });
    test('Should calculate statistics correctly', () => {
        // Add multiple measurements
        for (let i = 0; i < 10; i++) {
            performanceMonitor.startTimer('stats-test');
            performanceMonitor.endTimer('stats-test');
        }
        const stats = performanceMonitor.getStatistics('stats-test');
        assert.ok(stats);
        assert.strictEqual(stats.count, 10);
        assert.ok(stats.minTime >= 0);
        assert.ok(stats.maxTime >= stats.minTime);
        assert.ok(stats.avgTime >= 0);
        assert.ok(stats.p50 >= 0);
        assert.ok(stats.p95 >= 0);
        assert.ok(stats.p99 >= 0);
    });
    test('Should return null for non-existent statistics', () => {
        const stats = performanceMonitor.getStatistics('non-existent');
        assert.strictEqual(stats, null);
    });
    test('Should log warnings', () => {
        performanceMonitor.logWarning({ message: 'Test warning' });
        assert.ok(outputChannel.appendLine.called);
        const call = outputChannel.appendLine.firstCall.args[0];
        assert.ok(call.includes('[WARNING]'));
        assert.ok(call.includes('Test warning'));
    });
    test('Should handle high memory usage', () => {
        // Mock high memory usage
        sandbox.stub(process, 'memoryUsage').returns({
            rss: 2 * 1024 * 1024 * 1024, // 2GB
            heapTotal: 1.5 * 1024 * 1024 * 1024,
            heapUsed: 1.2 * 1024 * 1024 * 1024, // 1.2GB
            external: 100 * 1024 * 1024,
            arrayBuffers: 50 * 1024 * 1024
        });
        const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage');
        performanceMonitor.start();
        // Trigger resource check
        performanceMonitor.checkResourceUsage();
        assert.ok(showWarningStub.called);
        assert.ok(outputChannel.appendLine.called);
    });
    test('Should export metrics as JSON', () => {
        performanceMonitor.startTimer('export-test');
        performanceMonitor.endTimer('export-test');
        const exported = performanceMonitor.exportMetrics();
        const parsed = JSON.parse(exported);
        assert.ok(parsed.timestamp);
        assert.ok(parsed.operations);
        assert.ok(parsed.resourceUsage);
    });
    test('Should clear metrics', () => {
        performanceMonitor.startTimer('clear-test');
        performanceMonitor.endTimer('clear-test');
        let stats = performanceMonitor.getStatistics('clear-test');
        assert.ok(stats);
        performanceMonitor.clearMetrics();
        stats = performanceMonitor.getStatistics('clear-test');
        assert.strictEqual(stats, null);
    });
    test('Should handle percentile edge cases', () => {
        // Single measurement
        performanceMonitor.startTimer('single');
        performanceMonitor.endTimer('single');
        const stats = performanceMonitor.getStatistics('single');
        assert.ok(stats);
        assert.strictEqual(stats.count, 1);
        assert.strictEqual(stats.p50, stats.minTime);
        assert.strictEqual(stats.p95, stats.minTime);
        assert.strictEqual(stats.p99, stats.minTime);
    });
});
//# sourceMappingURL=PerformanceMonitor.test.js.map