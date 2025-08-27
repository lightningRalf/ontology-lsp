/**
 * Comprehensive error handling utilities for MCP server
 * 
 * Provides error recovery, connection state management, and proper
 * MCP protocol error responses.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { fileLogger, mcpLogger } from './file-logger.js';

export interface ErrorContext {
  component: string;
  operation: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  timestamp: number;
}

export interface RecoveryOptions {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number;
  exponentialBackoff: boolean;
  circuitBreakerThreshold: number; // failures before opening circuit
}

export class ErrorHandler {
  private retryAttempts = new Map<string, number>();
  private circuitBreakerState = new Map<string, {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
  }>();

  private defaultOptions: RecoveryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialBackoff: true,
    circuitBreakerThreshold: 5
  };

  constructor(private options: Partial<RecoveryOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Wrap an async operation with comprehensive error handling and recovery
   */
  async withErrorHandling<T>(
    context: ErrorContext,
    operation: () => Promise<T>,
    options?: Partial<RecoveryOptions>
  ): Promise<T> {
    const effectiveOptions = { ...this.options, ...options };
    const operationKey = `${context.component}:${context.operation}`;

    // Check circuit breaker
    if (this.isCircuitOpen(operationKey)) {
      const error = new Error(`Circuit breaker open for ${operationKey}`);
      this.logError(context, error, { circuitBreakerOpen: true });
      throw this.createMcpError(ErrorCode.InternalError, error.message, context);
    }

    let lastError: Error | undefined;
    const maxAttempts = effectiveOptions.maxRetries + 1; // +1 for initial attempt

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Log attempt
        if (attempt > 1) {
          mcpLogger.info(`Retry attempt ${attempt}/${maxAttempts} for ${context.operation}`, {
            context,
            attempt
          });
        }

        const startTime = Date.now();
        const result = await this.withTimeout(operation(), 30000); // 30 second timeout
        const duration = Date.now() - startTime;

        // Success - reset retry counter and close circuit
        this.retryAttempts.delete(operationKey);
        this.resetCircuitBreaker(operationKey);

        mcpLogger.logPerformance(context.operation, duration, true, { 
          attempt,
          component: context.component 
        });

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        this.logError(context, lastError, { 
          attempt, 
          maxAttempts,
          willRetry: attempt < maxAttempts
        });

        // Update circuit breaker
        this.recordFailure(operationKey);

        // Don't retry on certain error types
        if (this.shouldNotRetry(lastError)) {
          mcpLogger.warn('Not retrying due to error type', { 
            error: lastError.message,
            type: lastError.constructor.name
          });
          break;
        }

        // Wait before retry (except on last attempt)
        if (attempt < maxAttempts) {
          const delay = this.calculateDelay(attempt, effectiveOptions);
          mcpLogger.debug(`Waiting ${delay}ms before retry`, { attempt, delay });
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      this.logError(context, lastError, { 
        allRetriesExhausted: true,
        totalAttempts: maxAttempts 
      });
      
      throw this.createMcpError(
        this.mapErrorToMcpCode(lastError),
        `Operation failed after ${maxAttempts} attempts: ${lastError.message}`,
        context,
        lastError
      );
    }

    // Should never reach here, but just in case
    throw this.createMcpError(
      ErrorCode.InternalError,
      'Unknown error in retry logic',
      context
    );
  }

  /**
   * Handle connection-related errors with automatic recovery
   */
  async handleConnectionError(
    error: Error,
    context: ErrorContext,
    reconnectFn?: () => Promise<void>
  ): Promise<void> {
    mcpLogger.logConnection('error', { 
      error: error.message,
      context 
    });

    // Attempt reconnection if function provided
    if (reconnectFn) {
      try {
        await this.withErrorHandling(
          { ...context, operation: 'reconnect' },
          reconnectFn,
          { maxRetries: 2, baseDelay: 2000 }
        );
        mcpLogger.logConnection('connect', { reconnected: true });
      } catch (reconnectError) {
        mcpLogger.error('Failed to reconnect', reconnectError);
        throw this.createMcpError(
          ErrorCode.InternalError,
          'Connection lost and reconnection failed',
          context,
          error
        );
      }
    }
  }

  /**
   * Validate request parameters and throw appropriate errors
   */
  validateRequest(request: any, requiredFields: string[], context: ErrorContext): void {
    try {
      if (!request || typeof request !== 'object') {
        throw new Error('Request must be an object');
      }

      for (const field of requiredFields) {
        if (request[field] === undefined || request[field] === null) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate field types if needed
      this.validateFieldTypes(request, context);

    } catch (error) {
      const validationError = error instanceof Error ? error : new Error(String(error));
      this.logError(context, validationError, { 
        requestValidation: true,
        request: this.sanitizeForLogging(request)
      });
      
      throw this.createMcpError(
        ErrorCode.InvalidParams,
        validationError.message,
        context,
        validationError
      );
    }
  }

  /**
   * Create a properly formatted MCP error
   */
  createMcpError(
    code: ErrorCode,
    message: string,
    context: ErrorContext,
    originalError?: Error
  ): McpError {
    const mcpError = new McpError(code, message);
    
    // Add context to error data
    (mcpError as any).data = {
      component: context.component,
      operation: context.operation,
      requestId: context.requestId,
      timestamp: context.timestamp,
      originalError: originalError ? {
        name: originalError.name,
        message: originalError.message
      } : undefined
    };

    return mcpError;
  }

  /**
   * Sanitize sensitive data from logs
   */
  private sanitizeForLogging(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    const sanitized = { ...obj };

    for (const field of sensitiveFields) {
      if (sensitized[field]) {
        sensitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private logError(context: ErrorContext, error: Error, additionalData?: any): void {
    mcpLogger.error(
      `${context.operation} failed`,
      error,
      {
        context,
        ...additionalData
      }
    );
  }

  private validateFieldTypes(request: any, context: ErrorContext): void {
    // Add specific field type validations based on MCP protocol requirements
    
    if (request.symbol && typeof request.symbol !== 'string') {
      throw new Error('Field "symbol" must be a string');
    }

    if (request.file && typeof request.file !== 'string') {
      throw new Error('Field "file" must be a string');
    }

    if (request.position && typeof request.position !== 'object') {
      throw new Error('Field "position" must be an object');
    }

    if (request.position) {
      if (typeof request.position.line !== 'number' || request.position.line < 0) {
        throw new Error('Field "position.line" must be a non-negative number');
      }
      if (typeof request.position.character !== 'number' || request.position.character < 0) {
        throw new Error('Field "position.character" must be a non-negative number');
      }
    }
  }

  private shouldNotRetry(error: Error): boolean {
    // Don't retry on validation errors or client errors
    if (error.message.includes('Missing required') || 
        error.message.includes('Invalid') ||
        error.message.includes('must be')) {
      return true;
    }

    // Don't retry on authentication errors
    if (error.message.includes('unauthorized') || 
        error.message.includes('forbidden')) {
      return true;
    }

    return false;
  }

  private mapErrorToMcpCode(error: Error): ErrorCode {
    if (error.message.includes('timeout')) {
      return ErrorCode.RequestTimeout;
    }
    
    if (error.message.includes('Invalid') || 
        error.message.includes('Missing required') ||
        error.message.includes('must be')) {
      return ErrorCode.InvalidParams;
    }

    if (error.message.includes('not found')) {
      return ErrorCode.MethodNotFound;
    }

    return ErrorCode.InternalError;
  }

  private calculateDelay(attempt: number, options: RecoveryOptions): number {
    if (!options.exponentialBackoff) {
      return options.baseDelay;
    }

    const exponentialDelay = options.baseDelay * Math.pow(2, attempt - 1);
    const jitteredDelay = exponentialDelay + (Math.random() * 1000); // Add jitter
    
    return Math.min(jitteredDelay, options.maxDelay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private isCircuitOpen(operationKey: string): boolean {
    const state = this.circuitBreakerState.get(operationKey);
    if (!state) return false;

    if (state.isOpen) {
      // Check if enough time has passed to try again (half-open state)
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure > 60000) { // 1 minute
        state.isOpen = false;
        state.failures = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(operationKey: string): void {
    let state = this.circuitBreakerState.get(operationKey);
    if (!state) {
      state = { failures: 0, lastFailure: 0, isOpen: false };
      this.circuitBreakerState.set(operationKey, state);
    }

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.options.circuitBreakerThreshold!) {
      state.isOpen = true;
      mcpLogger.warn(`Circuit breaker opened for ${operationKey}`, {
        failures: state.failures,
        threshold: this.options.circuitBreakerThreshold
      });
    }
  }

  private resetCircuitBreaker(operationKey: string): void {
    this.circuitBreakerState.delete(operationKey);
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();

// Utility functions for common error handling patterns
export function withMcpErrorHandling<T>(
  component: string,
  operation: string,
  fn: () => Promise<T>,
  requestId?: string
): Promise<T> {
  const context: ErrorContext = {
    component,
    operation,
    requestId,
    timestamp: Date.now()
  };

  return globalErrorHandler.withErrorHandling(context, fn);
}

export function createValidationError(message: string, context: ErrorContext): McpError {
  return globalErrorHandler.createMcpError(ErrorCode.InvalidParams, message, context);
}

export function createInternalError(message: string, context: ErrorContext, originalError?: Error): McpError {
  return globalErrorHandler.createMcpError(ErrorCode.InternalError, message, context, originalError);
}