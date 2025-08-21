"use strict";
/**
 * Telemetry Manager
 * Handles anonymous telemetry with privacy protection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryManager = void 0;
class TelemetryManager {
    constructor(context, config) {
        this.context = context;
        this.config = config;
        this.enabled = false;
        this.queue = [];
    }
    async initialize() {
        this.enabled = this.config.get('telemetry.enabled', false);
        if (this.enabled) {
            // Process queued events
            await this.flushQueue();
        }
    }
    logEvent(event, properties) {
        if (!this.enabled)
            return;
        const telemetryEvent = {
            event,
            properties: {
                ...properties,
                timestamp: Date.now(),
                version: this.context.extension.packageJSON.version
            }
        };
        this.queue.push(telemetryEvent);
        // Batch send events
        if (this.queue.length >= 10) {
            this.flushQueue();
        }
    }
    logError(event, error) {
        this.logEvent(`error.${event}`, {
            message: error.message,
            stack: error.stack
        });
    }
    async flushQueue() {
        if (this.queue.length === 0)
            return;
        // In production, this would send to telemetry service
        console.log('[Telemetry]', this.queue);
        this.queue = [];
    }
    async dispose() {
        await this.flushQueue();
    }
}
exports.TelemetryManager = TelemetryManager;
//# sourceMappingURL=TelemetryManager.js.map