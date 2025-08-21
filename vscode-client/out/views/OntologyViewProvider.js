"use strict";
/**
 * Ontology View Provider
 * Provides tree view of concepts in the explorer
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
exports.OntologyViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class OntologyViewProvider {
    constructor(context, client) {
        this.context = context;
        this.client = client;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.concepts = [];
        this.refresh();
    }
    refresh() {
        this.loadConcepts();
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve(this.concepts);
        }
        return Promise.resolve(element.children || []);
    }
    async loadConcepts() {
        if (!this.client)
            return;
        try {
            const data = await this.client.sendRequest('ontology/getConcepts', {});
            this.concepts = this.buildTree(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load concepts:', error);
            this.concepts = [];
        }
    }
    buildTree(data) {
        return data.map(item => new ConceptItem(item.name, item.type, vscode.TreeItemCollapsibleState.Collapsed, item.children ? this.buildTree(item.children) : undefined));
    }
}
exports.OntologyViewProvider = OntologyViewProvider;
class ConceptItem extends vscode.TreeItem {
    constructor(label, type, collapsibleState, children) {
        super(label, collapsibleState);
        this.label = label;
        this.type = type;
        this.collapsibleState = collapsibleState;
        this.children = children;
        this.tooltip = `${this.type}: ${this.label}`;
        this.contextValue = this.type;
        // Set appropriate icon
        switch (this.type) {
            case 'class':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'function':
                this.iconPath = new vscode.ThemeIcon('symbol-method');
                break;
            case 'variable':
                this.iconPath = new vscode.ThemeIcon('symbol-variable');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        }
    }
}
//# sourceMappingURL=OntologyViewProvider.js.map