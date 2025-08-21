/**
 * Security Manager
 * Handles sensitive pattern filtering, privacy protection, and secure communication
 *
 * Fifth-order consideration: Prevents exposure of proprietary patterns and secrets
 */
import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/ConfigurationManager';
export declare class SecurityManager {
    private config;
    private sensitivePatterns;
    private trustedDomains;
    private encryptionKey;
    private securityLevel;
    constructor(config: ConfigurationManager);
    initialize(): Promise<void>;
    /**
     * Filter sensitive information from patterns before learning
     */
    filterSensitivePatterns(code: string): string;
    /**
     * Check if a file should be excluded from analysis for security reasons
     */
    shouldExcludeFile(uri: vscode.Uri): boolean;
    /**
     * Validate if a pattern is safe to share with team
     */
    isPatternSafeToShare(pattern: any): boolean;
    /**
     * Encrypt sensitive data before storage
     */
    encrypt(data: string): string;
    /**
     * Decrypt sensitive data from storage
     */
    decrypt(encryptedData: string): string;
    /**
     * Validate connection to language server
     */
    validateConnection(host: string, port: number): boolean;
    /**
     * Get current security level for server communication
     */
    getSecurityLevel(): string;
    /**
     * Generate audit log entry for security events
     */
    auditLog(event: string, details: any): void;
    private getOrCreateEncryptionKey;
    private determineSecurityLevel;
    private loadCustomPatterns;
    private setupSecurityWatcher;
    private loadSecurityConfig;
}
//# sourceMappingURL=SecurityManager.d.ts.map