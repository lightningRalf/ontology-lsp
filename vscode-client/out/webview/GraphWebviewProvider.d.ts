/**
 * Graph Webview Provider
 * Provides interactive visualization of the concept graph
 */
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
export declare class GraphWebviewProvider implements vscode.WebviewViewProvider {
    private context;
    private client;
    constructor(context: vscode.ExtensionContext, client: LanguageClient | undefined);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private getHtmlContent;
    private updateGraph;
    private handleNodeClick;
}
//# sourceMappingURL=GraphWebviewProvider.d.ts.map