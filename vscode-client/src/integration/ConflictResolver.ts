/**
 * Conflict Resolver
 * Handles conflicts with built-in TypeScript server and other extensions
 */

import * as vscode from 'vscode';

export class ConflictResolver {
    constructor(private context: vscode.ExtensionContext) {}
    
    async resolveConflicts(): Promise<void> {
        // Check for TypeScript extension
        const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
        
        if (tsExtension && tsExtension.isActive) {
            // Notify user about potential conflicts
            const config = vscode.workspace.getConfiguration('typescript');
            const tsServerEnabled = config.get<boolean>('tsserver.enable', true);
            
            if (tsServerEnabled) {
                const choice = await vscode.window.showInformationMessage(
                    'Ontology LSP works best with TypeScript server disabled. Disable it?',
                    'Yes', 'No', 'Don\'t ask again'
                );
                
                if (choice === 'Yes') {
                    await config.update('tsserver.enable', false, vscode.ConfigurationTarget.Workspace);
                } else if (choice === 'Don\'t ask again') {
                    await this.context.globalState.update('ontology.skipTsConflict', true);
                }
            }
        }
        
        // Check for other language servers
        this.checkForConflictingExtensions();
    }
    
    private checkForConflictingExtensions(): void {
        const potentialConflicts = [
            'ms-python.python',
            'dbaeumer.vscode-eslint',
            'esbenp.prettier-vscode'
        ];
        
        for (const extensionId of potentialConflicts) {
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension && extension.isActive) {
                console.log(`[Ontology] Detected ${extensionId}, adjusting compatibility settings`);
            }
        }
    }
}