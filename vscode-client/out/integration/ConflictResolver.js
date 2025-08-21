"use strict";
/**
 * Conflict Resolver
 * Handles conflicts with built-in TypeScript server and other extensions
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
exports.ConflictResolver = void 0;
const vscode = __importStar(require("vscode"));
class ConflictResolver {
    constructor(context) {
        this.context = context;
    }
    async resolveConflicts() {
        // Check for TypeScript extension
        const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
        if (tsExtension && tsExtension.isActive) {
            // Notify user about potential conflicts
            const config = vscode.workspace.getConfiguration('typescript');
            const tsServerEnabled = config.get('tsserver.enable', true);
            if (tsServerEnabled) {
                const choice = await vscode.window.showInformationMessage('Ontology LSP works best with TypeScript server disabled. Disable it?', 'Yes', 'No', 'Don\'t ask again');
                if (choice === 'Yes') {
                    await config.update('tsserver.enable', false, vscode.ConfigurationTarget.Workspace);
                }
                else if (choice === 'Don\'t ask again') {
                    await this.context.globalState.update('ontology.skipTsConflict', true);
                }
            }
        }
        // Check for other language servers
        this.checkForConflictingExtensions();
    }
    checkForConflictingExtensions() {
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
exports.ConflictResolver = ConflictResolver;
//# sourceMappingURL=ConflictResolver.js.map