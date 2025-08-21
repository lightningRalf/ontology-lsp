"use strict";
/**
 * Performance Monitor
 * Tracks performance metrics, identifies bottlenecks, and optimizes resource usage
 *
 * Second-order consideration: Prevents performance degradation with large codebases
 * Third-order consideration: Memory management and cache optimization
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
exports.PerformanceMonitor = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
class PerformanceMonitor {
    constructor(context) {
        this.context = context;
        this.metrics = new Map();
        this.activeTimers = new Map();
        this.memoryBaseline = 0;
        this.cpuBaseline = 0;
        this.monitoringInterval = null;
        // Thresholds for performance warnings
        this.SLOW_OPERATION_THRESHOLD = 1000; // 1 second
        this.MEMORY_WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB
        this.CPU_WARNING_THRESHOLD = 80; // 80% CPU usage
        this.outputChannel = vscode.window.createOutputChannel('Ontology Performance');
    }
    start() {
        // Capture baseline metrics
        this.memoryBaseline = process.memoryUsage().heapUsed;
        this.cpuBaseline = os.loadavg()[0];
        // Start periodic monitoring
        this.monitoringInterval = setInterval(() => {
            this.checkResourceUsage();
        }, 10000); // Check every 10 seconds
        // Register performance commands
        this.context.subscriptions.push(vscode.commands.registerCommand('ontology.showPerformance', () => {
            this.showPerformanceReport();
        }));
    }
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        // Generate final performance report
        this.generateReport();
    }
    startTimer(operation, metadata) {
        const metric = {
            name: operation,
            startTime: performance.now(),
            metadata
        };
        this.activeTimers.set(operation, metric);
    }
    endTimer(operation) {
        const metric = this.activeTimers.get(operation);
        if (!metric) {
            console.warn(`No active timer for operation: ${operation}`);
            return 0;
        }
        metric.endTime = performance.now();
        metric.duration = metric.endTime - metric.startTime;
        // Store completed metric
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }
        this.metrics.get(operation).push(metric);
        // Clean up active timer
        this.activeTimers.delete(operation);
        // Check for slow operations
        if (metric.duration > this.SLOW_OPERATION_THRESHOLD) {
            this.handleSlowOperation(operation, metric);
        }
        return metric.duration;
    }
    async measureAsync(operation, fn) {
        this.startTimer(operation);
        try {
            const result = await fn();
            return result;
        }
        finally {
            this.endTimer(operation);
        }
    }
    measure(operation, fn) {
        this.startTimer(operation);
        try {
            const result = fn();
            return result;
        }
        finally {
            this.endTimer(operation);
        }
    }
    logWarning(warning) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[WARNING] ${timestamp}: ${JSON.stringify(warning)}`);
        // Store warning in metrics
        if (!this.metrics.has('warnings')) {
            this.metrics.set('warnings', []);
        }
        this.metrics.get('warnings').push({
            name: 'warning',
            startTime: performance.now(),
            metadata: warning
        });
    }
    getStatistics(operation) {
        const metrics = this.metrics.get(operation);
        if (!metrics || metrics.length === 0) {
            return null;
        }
        const durations = metrics
            .filter(m => m.duration !== undefined)
            .map(m => m.duration);
        if (durations.length === 0) {
            return null;
        }
        durations.sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const min = durations[0];
        const max = durations[durations.length - 1];
        const p50 = this.percentile(durations, 0.5);
        const p95 = this.percentile(durations, 0.95);
        const p99 = this.percentile(durations, 0.99);
        return {
            operation,
            count: durations.length,
            totalTime: sum,
            minTime: min,
            maxTime: max,
            avgTime: avg,
            p50,
            p95,
            p99
        };
    }
    percentile(sorted, p) {
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    checkResourceUsage() {
        const memUsage = process.memoryUsage();
        const currentMemory = memUsage.heapUsed;
        const memoryIncrease = currentMemory - this.memoryBaseline;
        // Check memory usage
        if (memoryIncrease > this.MEMORY_WARNING_THRESHOLD) {
            this.handleHighMemoryUsage(currentMemory, memoryIncrease);
        }
        // Check CPU usage
        const currentCpu = os.loadavg()[0];
        const cpuPercentage = (currentCpu / os.cpus().length) * 100;
        if (cpuPercentage > this.CPU_WARNING_THRESHOLD) {
            this.handleHighCpuUsage(cpuPercentage);
        }
        // Log periodic metrics
        this.logMetrics({
            timestamp: Date.now(),
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            },
            cpu: {
                loadAvg: os.loadavg(),
                percentage: cpuPercentage
            }
        });
    }
    handleSlowOperation(operation, metric) {
        const message = `Slow operation detected: ${operation} took ${metric.duration?.toFixed(2)}ms`;
        this.outputChannel.appendLine(`[SLOW] ${message}`);
        // Show warning to user for very slow operations
        if (metric.duration && metric.duration > 5000) {
            vscode.window.showWarningMessage(message);
        }
        // Send telemetry
        const existingData = this.context.globalState.get(`perf.slow.${operation}`);
        this.context.globalState.update(`perf.slow.${operation}`, {
            count: (existingData?.count || 0) + 1,
            lastDuration: metric.duration,
            lastOccurrence: Date.now()
        });
    }
    handleHighMemoryUsage(current, increase) {
        const currentMB = (current / 1024 / 1024).toFixed(2);
        const increaseMB = (increase / 1024 / 1024).toFixed(2);
        this.outputChannel.appendLine(`[MEMORY] High memory usage: ${currentMB}MB (increase: ${increaseMB}MB)`);
        // Suggest garbage collection
        if (global.gc) {
            global.gc();
            this.outputChannel.appendLine('[MEMORY] Triggered garbage collection');
        }
        // Notify user if memory is critically high
        if (current > 1024 * 1024 * 1024) { // 1GB
            vscode.window.showWarningMessage(`Ontology LSP: High memory usage (${currentMB}MB). Consider restarting the extension.`);
        }
    }
    handleHighCpuUsage(percentage) {
        this.outputChannel.appendLine(`[CPU] High CPU usage: ${percentage.toFixed(2)}%`);
        // Throttle operations if CPU is critically high
        if (percentage > 90) {
            vscode.window.showWarningMessage(`Ontology LSP: High CPU usage (${percentage.toFixed(0)}%). Some operations may be delayed.`);
        }
    }
    logMetrics(metrics) {
        // Store metrics for analysis
        if (!this.metrics.has('system')) {
            this.metrics.set('system', []);
        }
        this.metrics.get('system').push({
            name: 'system',
            startTime: performance.now(),
            metadata: metrics
        });
    }
    showPerformanceReport() {
        this.outputChannel.clear();
        this.outputChannel.appendLine('=== Ontology LSP Performance Report ===\n');
        // Show operation statistics
        for (const [operation, metrics] of this.metrics) {
            if (operation === 'warnings' || operation === 'system')
                continue;
            const stats = this.getStatistics(operation);
            if (stats) {
                this.outputChannel.appendLine(`Operation: ${operation}`);
                this.outputChannel.appendLine(`  Count: ${stats.count}`);
                this.outputChannel.appendLine(`  Avg: ${stats.avgTime.toFixed(2)}ms`);
                this.outputChannel.appendLine(`  Min: ${stats.minTime.toFixed(2)}ms`);
                this.outputChannel.appendLine(`  Max: ${stats.maxTime.toFixed(2)}ms`);
                this.outputChannel.appendLine(`  P50: ${stats.p50.toFixed(2)}ms`);
                this.outputChannel.appendLine(`  P95: ${stats.p95.toFixed(2)}ms`);
                this.outputChannel.appendLine(`  P99: ${stats.p99.toFixed(2)}ms`);
                this.outputChannel.appendLine('');
            }
        }
        // Show current resource usage
        const memUsage = process.memoryUsage();
        this.outputChannel.appendLine('Current Resource Usage:');
        this.outputChannel.appendLine(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        this.outputChannel.appendLine(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
        this.outputChannel.appendLine(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`);
        this.outputChannel.appendLine(`  CPU Load: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`);
        this.outputChannel.show();
    }
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            operations: {},
            resourceUsage: {
                memory: process.memoryUsage(),
                cpu: os.loadavg()
            }
        };
        for (const [operation, _] of this.metrics) {
            const stats = this.getStatistics(operation);
            if (stats) {
                report.operations[operation] = stats;
            }
        }
        return report;
    }
    exportMetrics() {
        const report = this.generateReport();
        return JSON.stringify(report, null, 2);
    }
    clearMetrics() {
        this.metrics.clear();
        this.activeTimers.clear();
        this.memoryBaseline = process.memoryUsage().heapUsed;
        this.cpuBaseline = os.loadavg()[0];
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.js.map