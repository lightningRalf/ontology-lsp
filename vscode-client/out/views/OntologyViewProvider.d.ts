/**
 * Ontology View Provider
 * Provides tree view of concepts in the explorer
 */
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
export declare class OntologyViewProvider implements vscode.TreeDataProvider<ConceptItem> {
    private context;
    private client;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | ConceptItem | null | undefined>;
    private concepts;
    constructor(context: vscode.ExtensionContext, client: LanguageClient | undefined);
    refresh(): void;
    getTreeItem(element: ConceptItem): vscode.TreeItem;
    getChildren(element?: ConceptItem): Thenable<ConceptItem[]>;
    private loadConcepts;
    private buildTree;
}
declare class ConceptItem extends vscode.TreeItem {
    readonly label: string;
    readonly type: string;
    readonly collapsibleState: vscode.TreeItemCollapsibleState;
    readonly children?: ConceptItem[] | undefined;
    constructor(label: string, type: string, collapsibleState: vscode.TreeItemCollapsibleState, children?: ConceptItem[] | undefined);
}
export {};
//# sourceMappingURL=OntologyViewProvider.d.ts.map