"use strict";
/**
 * Graph Webview Provider
 * Provides interactive visualization of the concept graph
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
exports.GraphWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class GraphWebviewProvider {
    constructor(context, client) {
        this.context = context;
        this.client = client;
    }
    resolveWebviewView(webviewView, context, _token) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewView.webview.html = this.getHtmlContent(webviewView.webview);
        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    await this.updateGraph(webviewView.webview);
                    break;
                case 'nodeClick':
                    await this.handleNodeClick(message.nodeId);
                    break;
            }
        });
    }
    getHtmlContent(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ontology Graph</title>
            <style>
                body { margin: 0; padding: 0; overflow: hidden; }
                #graph { width: 100vw; height: 100vh; }
                .controls { position: absolute; top: 10px; right: 10px; }
                button { margin: 5px; padding: 5px 10px; }
            </style>
        </head>
        <body>
            <div class="controls">
                <button onclick="refresh()">Refresh</button>
                <button onclick="zoomIn()">Zoom In</button>
                <button onclick="zoomOut()">Zoom Out</button>
                <button onclick="resetView()">Reset</button>
            </div>
            <div id="graph"></div>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <script>
                const vscode = acquireVsCodeApi();
                let simulation;
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function renderGraph(data) {
                    // D3.js force-directed graph implementation
                    const width = window.innerWidth;
                    const height = window.innerHeight;
                    
                    d3.select("#graph").selectAll("*").remove();
                    
                    const svg = d3.select("#graph")
                        .append("svg")
                        .attr("width", width)
                        .attr("height", height);
                    
                    // Simplified graph rendering
                    // Full implementation would include nodes, links, forces, etc.
                }
                
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateGraph') {
                        renderGraph(message.data);
                    }
                });
                
                // Initial load
                refresh();
            </script>
        </body>
        </html>`;
    }
    async updateGraph(webview) {
        if (!this.client)
            return;
        const graphData = await this.client.sendRequest('ontology/getConceptGraph', {});
        webview.postMessage({ command: 'updateGraph', data: graphData });
    }
    async handleNodeClick(nodeId) {
        // Navigate to node definition
        if (!this.client)
            return;
        const location = await this.client.sendRequest('ontology/getConceptLocation', { id: nodeId });
        if (location && location.uri && location.range) {
            const locationObj = location;
            const uri = vscode.Uri.parse(locationObj.uri);
            const position = new vscode.Position(locationObj.range.start.line, locationObj.range.start.character);
            await vscode.window.showTextDocument(uri, { selection: new vscode.Range(position, position) });
        }
    }
}
exports.GraphWebviewProvider = GraphWebviewProvider;
//# sourceMappingURL=GraphWebviewProvider.js.map