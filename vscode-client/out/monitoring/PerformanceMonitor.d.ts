/**
 * Performance Monitor
 * Tracks performance metrics, identifies bottlenecks, and optimizes resource usage
 *
 * Second-order consideration: Prevents performance degradation with large codebases
 * Third-order consideration: Memory management and cache optimization
 */
import * as vscode from 'vscode';
interface PerformanceStats {
    operation: string;
    count: number;
    totalTime: number;
    minTime: number;
    maxTime: number;
    avgTime: number;
    p50: number;
    p95: number;
    p99: number;
}
export declare class PerformanceMonitor {
    private context;
    private metrics;
    private activeTimers;
    private memoryBaseline;
    private cpuBaseline;
    private monitoringInterval;
    private outputChannel;
    private readonly SLOW_OPERATION_THRESHOLD;
    private readonly MEMORY_WARNING_THRESHOLD;
    private readonly CPU_WARNING_THRESHOLD;
    constructor(context: vscode.ExtensionContext);
    start(): void;
    stop(): void;
    startTimer(operation: string, metadata?: any): void;
    endTimer(operation: string): number;
    measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>;
    measure<T>(operation: string, fn: () => T): T;
    logWarning(warning: any): void;
    getStatistics(operation: string): PerformanceStats | null;
    private percentile;
    private checkResourceUsage;
    private handleSlowOperation;
    private handleHighMemoryUsage;
    private handleHighCpuUsage;
    private logMetrics;
    private showPerformanceReport;
    private generateReport;
    exportMetrics(): string;
    clearMetrics(): void;
}
export {};
//# sourceMappingURL=PerformanceMonitor.d.ts.map