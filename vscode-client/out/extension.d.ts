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
import * as vscode from 'vscode';
import { ExtensionAPI } from './api/ExtensionAPI';
export declare function activate(context: vscode.ExtensionContext): Promise<ExtensionAPI>;
export declare function deactivate(): Promise<void>;
//# sourceMappingURL=extension.d.ts.map