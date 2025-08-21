/**
 * Conflict Resolver
 * Handles conflicts with built-in TypeScript server and other extensions
 */
import * as vscode from 'vscode';
export declare class ConflictResolver {
    private context;
    constructor(context: vscode.ExtensionContext);
    resolveConflicts(): Promise<void>;
    private checkForConflictingExtensions;
}
//# sourceMappingURL=ConflictResolver.d.ts.map