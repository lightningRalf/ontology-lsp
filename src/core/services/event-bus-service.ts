/**
 * EventBusService - Simple event bus implementation for inter-service communication
 * Provides pub/sub functionality for the unified architecture
 */

import { EventEmitter } from 'events';
import type { EventBus } from '../types.js';

/**
 * Default event bus implementation using Node.js EventEmitter
 */
export class EventBusService extends EventEmitter implements EventBus {
    private maxListeners: number;

    constructor(maxListeners: number = 100) {
        super();
        this.maxListeners = maxListeners;
        this.setMaxListeners(maxListeners);
    }

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

    /**
     * Get current listener count for an event
     */
    getListenerCount(event: string): number {
        return this.listenerCount(event);
    }

    /**
     * Get all registered event names
     */
    getEventNames(): (string | symbol)[] {
        return this.eventNames();
    }

    /**
     * Remove all listeners
     */
    removeAllListeners(event?: string): void {
        super.removeAllListeners(event);
    }

    /**
     * Get diagnostic information
     */
    getDiagnostics(): {
        maxListeners: number;
        eventNames: (string | symbol)[];
        listenerCounts: Record<string, number>;
    } {
        const eventNames = this.getEventNames();
        const listenerCounts: Record<string, number> = {};

        for (const eventName of eventNames) {
            if (typeof eventName === 'string') {
                listenerCounts[eventName] = this.getListenerCount(eventName);
            }
        }

        return {
            maxListeners: this.maxListeners,
            eventNames,
            listenerCounts,
        };
    }
}
