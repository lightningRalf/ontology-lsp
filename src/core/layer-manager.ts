/**
 * LayerManager - Manages all 5 layers with performance monitoring and caching
 * This is the orchestration layer that ensures optimal performance across the system
 */

import { EventEmitter } from 'events';
import {
    type CoreConfig,
    type EventBus,
    type HealthStatus,
    type LayerManager as ILayerManager,
    type Layer,
    type LayerHealthStatus,
    type LayerMetrics,
    LayerTimeoutError,
    LayerUnavailableError,
    type PerformanceMetrics,
    type PerformanceReport,
    type RequestMetadata,
} from './types.js';

/**
 * Performance targets for each layer (from VISION.md)
 * Updated to realistic values based on enhanced search tools performance
 */
const LAYER_TARGETS = {
    layer1: 50, // Fast search with ripgrep/enhanced tools (increased from 5ms)
    layer2: 50, // AST analysis with tree-sitter
    layer3: 10, // Symbol map & planner
    layer4: 10, // Ontology / semantic graph
    layer5: 20, // Pattern learning & propagation
} as const;

const TOTAL_TARGET = 100; // 95% of requests < 100ms

export class LayerManager implements ILayerManager {
    private layers: Map<string, Layer> = new Map();
    private metrics: Map<string, LayerMetrics> = new Map();
    private eventBus: EventBus;
    private config: CoreConfig;
    private initialized = false;
    private healthCheckTimer?: NodeJS.Timeout;
    private performanceHistory: PerformanceMetrics[] = [];
    private maxHistorySize = 1000;

    constructor(config: CoreConfig, eventBus: EventBus) {
        this.config = config;
        this.eventBus = eventBus;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize metrics for each layer
            for (const layerName of ['layer1', 'layer2', 'layer3', 'layer4', 'layer5']) {
                this.metrics.set(layerName, {
                    name: layerName,
                    requestCount: 0,
                    averageLatency: 0,
                    p95Latency: 0,
                    errorCount: 0,
                    cacheHitRate: 0,
                    lastRequestTime: undefined,
                });
            }

            // Register mock layers for testing
            this.registerMockLayers();

            // Start health monitoring
            if (this.config.monitoring.enabled) {
                this.startHealthCheck();
            }

            this.initialized = true;

            this.eventBus.emit('layer-manager:initialized', {
                timestamp: Date.now(),
                layerCount: this.layers.size,
            });
        } catch (error) {
            this.eventBus.emit('layer-manager:error', {
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now(),
            });
            throw error;
        }
    }

    async dispose(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        // Stop health monitoring
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        // Dispose all layers
        const disposePromises = Array.from(this.layers.values()).map((layer) =>
            layer.dispose().catch((error) => {
                console.error(`Error disposing layer ${layer.name}:`, error);
            })
        );

        await Promise.all(disposePromises);

        this.layers.clear();
        this.metrics.clear();
        this.performanceHistory.length = 0;
        this.initialized = false;

        this.eventBus.emit('layer-manager:disposed', {
            timestamp: Date.now(),
        });
    }

    registerLayer(layer: Layer): void {
        if (this.layers.has(layer.name)) {
            throw new Error(`Layer ${layer.name} is already registered`);
        }

        this.layers.set(layer.name, layer);

        // Initialize metrics for this layer if not exists
        if (!this.metrics.has(layer.name)) {
            this.metrics.set(layer.name, {
                name: layer.name,
                requestCount: 0,
                averageLatency: 0,
                p95Latency: 0,
                errorCount: 0,
                cacheHitRate: 0,
            });
        }

        this.eventBus.emit('layer-manager:layer-registered', {
            layerName: layer.name,
            targetLatency: layer.targetLatency,
            timestamp: Date.now(),
        });
    }

    unregisterLayer(layerName: string): void {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.dispose().catch((error) => {
                console.error(`Error disposing layer ${layerName}:`, error);
            });
            this.layers.delete(layerName);
            this.eventBus.emit('layer-manager:layer-unregistered', {
                layerName,
                timestamp: Date.now(),
            });
        }
    }

    getLayer(name: string): Layer | undefined {
        return this.layers.get(name);
    }

    getAllMetrics(): LayerMetrics[] {
        return Array.from(this.metrics.values());
    }

    isHealthy(): boolean {
        // System is healthy if:
        // 1. All required layers are healthy
        // 2. Overall performance is within targets
        // 3. Error rate is below threshold

        const healthyLayers = Array.from(this.layers.values()).filter((layer) => layer.isHealthy()).length;

        const totalLayers = this.layers.size;
        const healthyRatio = totalLayers > 0 ? healthyLayers / totalLayers : 0;

        // At least 80% of layers must be healthy
        if (healthyRatio < 0.8) {
            return false;
        }

        // Check overall error rate
        const totalErrors = Array.from(this.metrics.values()).reduce((sum, metric) => sum + metric.errorCount, 0);
        const totalRequests = Array.from(this.metrics.values()).reduce((sum, metric) => sum + metric.requestCount, 0);

        const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

        // Error rate should be below 5%
        return errorRate < 0.05;
    }

    getPerformanceReport(): PerformanceReport {
        const allMetrics = this.getAllMetrics();

        const totalRequests = allMetrics.reduce((sum, m) => sum + m.requestCount, 0);
        const totalErrors = allMetrics.reduce((sum, m) => sum + m.errorCount, 0);

        // Calculate weighted average latency
        const weightedLatency =
            allMetrics.reduce((sum, m) => {
                return sum + m.averageLatency * m.requestCount;
            }, 0) / Math.max(totalRequests, 1);

        // Calculate overall cache hit rate
        const weightedCacheHitRate =
            allMetrics.reduce((sum, m) => {
                return sum + m.cacheHitRate * m.requestCount;
            }, 0) / Math.max(totalRequests, 1);

        // Calculate p95 and p99 from performance history
        const recentLatencies = this.performanceHistory
            .slice(-1000) // Last 1000 requests
            .map((p) => p.duration || 0)
            .sort((a, b) => a - b);

        const p95Index = Math.floor(recentLatencies.length * 0.95);
        const p99Index = Math.floor(recentLatencies.length * 0.99);

        const layerBreakdown: Record<string, LayerMetrics> = {};
        for (const metric of allMetrics) {
            layerBreakdown[metric.name] = metric;
        }

        return {
            totalRequests,
            averageResponseTime: weightedLatency,
            p95ResponseTime: recentLatencies[p95Index] || 0,
            p99ResponseTime: recentLatencies[p99Index] || 0,
            errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
            cacheHitRate: weightedCacheHitRate,
            layerBreakdown,
            generatedAt: Date.now(),
        };
    }

    getHealthStatus(): HealthStatus {
        const layerHealthStatuses: Record<string, LayerHealthStatus> = {};

        for (const [name, layer] of this.layers.entries()) {
            const metrics = this.metrics.get(name);
            const isHealthy = layer.isHealthy();

            layerHealthStatuses[name] = {
                name,
                status: isHealthy ? 'healthy' : 'unhealthy',
                latency: metrics?.averageLatency || 0,
                errorRate: metrics ? metrics.errorCount / Math.max(metrics.requestCount, 1) : 0,
                lastCheck: Date.now(),
                details: isHealthy ? undefined : 'Layer reported unhealthy status',
            };
        }

        const performanceReport = this.getPerformanceReport();
        const overallStatus = this.isHealthy() ? 'healthy' : 'unhealthy';

        return {
            status: overallStatus,
            timestamp: Date.now(),
            layers: layerHealthStatuses,
            overall: {
                uptime: process.uptime() * 1000, // Convert to milliseconds
                requestCount: performanceReport.totalRequests,
                errorRate: performanceReport.errorRate,
                averageLatency: performanceReport.averageResponseTime,
            },
        };
    }

    /**
     * Execute a request with performance tracking and error handling
     */
    async executeWithLayer<T>(
        layerName: string,
        operation: string,
        requestMetadata: RequestMetadata,
        executor: (layer: Layer) => Promise<T>
    ): Promise<T> {
        const startTime = Date.now();
        const layer = this.layers.get(layerName);

        if (!layer) {
            throw new LayerUnavailableError(layerName, 'Layer not registered', requestMetadata.id);
        }

        if (!layer.isHealthy()) {
            throw new LayerUnavailableError(layerName, 'Layer is unhealthy', requestMetadata.id);
        }

        const metrics = this.metrics.get(layerName)!;

        try {
            // Async-first: do not gate layers behind artificial timeouts here.
            // Budgeting and cancellation are enforced in async orchestrators.
            const result = await executor(layer);

            // Update success metrics
            const duration = Date.now() - startTime;
            this.updateMetrics(layerName, duration, false, false);

            // Record performance data
            this.recordPerformance({
                startTime,
                endTime: Date.now(),
                duration,
                layer: layerName,
                operation,
                cacheHit: false, // Would be set by cache layer
                errorCount: 0,
                requestId: requestMetadata.id,
            });

            // Check if performance is degrading
            if (duration > layer.targetLatency * 1.5) {
                this.eventBus.emit('layer-manager:performance-warning', {
                    layerName,
                    actualLatency: duration,
                    targetLatency: layer.targetLatency,
                    operation,
                    requestId: requestMetadata.id,
                    timestamp: Date.now(),
                });
            }

            return result;
        } catch (error) {
            // Update error metrics
            const duration = Date.now() - startTime;
            this.updateMetrics(layerName, duration, true, false);

            // Record error performance data
            this.recordPerformance({
                startTime,
                endTime: Date.now(),
                duration,
                layer: layerName,
                operation,
                cacheHit: false,
                errorCount: 1,
                requestId: requestMetadata.id,
            });

            this.eventBus.emit('layer-manager:error', {
                layerName,
                operation,
                error: error instanceof Error ? error.message : String(error),
                requestId: requestMetadata.id,
                timestamp: Date.now(),
            });

            throw error;
        }
    }

    // executeCascade removed (sequential cascade no longer used in async-first flows)

    private updateMetrics(layerName: string, duration: number, wasError: boolean, wasCacheHit: boolean): void {
        const metrics = this.metrics.get(layerName)!;

        metrics.requestCount += 1;
        metrics.lastRequestTime = Date.now();

        if (wasError) {
            metrics.errorCount += 1;
        }

        // Update average latency (exponential moving average)
        const alpha = 0.1; // Smoothing factor
        metrics.averageLatency = metrics.averageLatency * (1 - alpha) + duration * alpha;

        // Update cache hit rate
        if (wasCacheHit) {
            metrics.cacheHitRate = metrics.cacheHitRate * (1 - alpha) + 1 * alpha;
        } else {
            metrics.cacheHitRate = metrics.cacheHitRate * (1 - alpha) + 0 * alpha;
        }

        // Update p95 latency (simplified calculation)
        metrics.p95Latency = Math.max(metrics.p95Latency * 0.95, duration);
    }

    private recordPerformance(metrics: PerformanceMetrics): void {
        this.performanceHistory.push(metrics);

        // Keep only recent history
        if (this.performanceHistory.length > this.maxHistorySize) {
            this.performanceHistory.splice(0, this.performanceHistory.length - this.maxHistorySize);
        }
    }

    private startHealthCheck(): void {
        const interval = this.config.performance.healthCheckInterval;

        this.healthCheckTimer = setInterval(() => {
            const healthStatus = this.getHealthStatus();

            this.eventBus.emit('layer-manager:health-check', {
                status: healthStatus.status,
                timestamp: healthStatus.timestamp,
                unhealthyLayers: Object.values(healthStatus.layers)
                    .filter((layer) => layer.status !== 'healthy')
                    .map((layer) => layer.name),
            });

            // Alert if system becomes unhealthy
            if (healthStatus.status !== 'healthy') {
                this.eventBus.emit('layer-manager:health-alert', {
                    status: healthStatus.status,
                    details: healthStatus,
                    timestamp: Date.now(),
                });
            }
        }, interval);
    }

    /**
     * Get diagnostic information for debugging
     */
    getDiagnostics(): Record<string, any> {
        const performanceReport = this.getPerformanceReport();
        const healthStatus = this.getHealthStatus();

        return {
            initialized: this.initialized,
            layerCount: this.layers.size,
            registeredLayers: Array.from(this.layers.keys()),
            performance: performanceReport,
            health: healthStatus,
            recentPerformance: this.performanceHistory.slice(-10),
            config: {
                targets: LAYER_TARGETS,
                totalTarget: TOTAL_TARGET,
                monitoring: this.config.monitoring.enabled,
            },
        };
    }

    /**
     * Register mock layers for testing - this creates simple mock implementations
     * that can be used in tests to avoid complex layer dependencies
     */
    private registerMockLayers(): void {
        const layerNames = ['layer1', 'layer2', 'layer3', 'layer4', 'layer5'];

        for (const layerName of layerNames) {
            // Only register mock if no real layer exists and it's enabled
            if (
                this.config.layers[layerName as keyof typeof this.config.layers]?.enabled &&
                !this.layers.has(layerName)
            ) {
                const mockLayer: Layer = {
                    name: layerName,
                    targetLatency: LAYER_TARGETS[layerName as keyof typeof LAYER_TARGETS],

                    async initialize(): Promise<void> {
                        // Mock initialization
                    },

                    async dispose(): Promise<void> {
                        // Mock disposal
                    },

                    async process(input: any): Promise<any> {
                        // Mock processing - return empty results
                        if (layerName === 'layer1') {
                            // Fast search layer - return some mock search results
                            return {
                                exact: [],
                                fuzzy: [],
                                conceptual: [],
                                files: new Set(),
                                searchTime: Math.random() * 10,
                            };
                        } else if (layerName === 'layer2') {
                            // AST layer - return mock AST nodes
                            return {
                                nodes: [],
                                relationships: [],
                                analysisTime: Math.random() * 50,
                            };
                        } else {
                            // Other layers - return empty results
                            return {
                                results: [],
                                processingTime: Math.random() * 20,
                            };
                        }
                    },

                    isHealthy(): boolean {
                        return true;
                    },

                    getMetrics(): LayerMetrics {
                        return (
                            this.metrics.get(layerName) || {
                                name: layerName,
                                requestCount: 0,
                                averageLatency: 0,
                                p95Latency: 0,
                                errorCount: 0,
                                cacheHitRate: 0,
                            }
                        );
                    },
                };

                this.registerLayer(mockLayer);
            }
        }
    }
}

/**
 * Create a default event bus implementation
 */
export class DefaultEventBus extends EventEmitter implements EventBus {
    emit<T>(event: string, data: T): void {
        super.emit(event, data);
    }

    on<T>(event: string, handler: (data: T) => void): void {
        super.on(event, handler);
    }

    off<T>(event: string, handler: (data: T) => void): void {
        super.off(event, handler);
    }

    once<T>(event: string, handler: (data: T) => void): void {
        super.once(event, handler);
    }
}
