"use strict";
/**
 * Status Bar Manager
 * Provides real-time feedback about server status, operations, and insights
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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    constructor(context) {
        this.context = context;
        this.currentStatus = 'inactive';
        this.stats = {
            concepts: 0,
            patterns: 0,
            lastOperation: '',
            operationTime: 0
        };
        // Main status indicator
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'ontology.showStats';
        // Progress indicator
        this.progressBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        // Statistics display
        this.statsBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
        this.statsBarItem.command = 'ontology.showGraph';
        context.subscriptions.push(this.statusBarItem);
        context.subscriptions.push(this.progressBarItem);
        context.subscriptions.push(this.statsBarItem);
    }
    show() {
        this.statusBarItem.show();
        this.statsBarItem.show();
        this.updateDisplay();
    }
    hide() {
        this.statusBarItem.hide();
        this.progressBarItem.hide();
        this.statsBarItem.hide();
    }
    setActive(message) {
        this.currentStatus = 'active';
        this.statusBarItem.text = `$(symbol-class) ${message || 'Ontology LSP'}`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = 'Ontology LSP is active\nClick for statistics';
        this.updateDisplay();
    }
    setInactive() {
        this.currentStatus = 'inactive';
        this.statusBarItem.text = '$(symbol-class) Ontology LSP (Inactive)';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.tooltip = 'Ontology LSP is inactive\nClick to restart';
        this.updateDisplay();
    }
    setError(message) {
        this.currentStatus = 'error';
        this.statusBarItem.text = `$(error) Ontology LSP: ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.tooltip = `Error: ${message}\nClick for details`;
        this.updateDisplay();
    }
    setWarning(message) {
        this.currentStatus = 'warning';
        this.statusBarItem.text = `$(warning) ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.tooltip = `Warning: ${message}`;
        this.updateDisplay();
    }
    setMessage(message, timeout = 3000) {
        const originalText = this.statusBarItem.text;
        this.statusBarItem.text = `$(info) ${message}`;
        setTimeout(() => {
            if (this.statusBarItem.text.includes(message)) {
                this.statusBarItem.text = originalText;
            }
        }, timeout);
    }
    setProgress(message, percentage) {
        if (percentage !== undefined) {
            const filled = Math.floor(percentage / 10);
            const empty = 10 - filled;
            const bar = '█'.repeat(filled) + '░'.repeat(empty);
            this.progressBarItem.text = `${message} [${bar}] ${percentage}%`;
        }
        else {
            this.progressBarItem.text = `$(sync~spin) ${message}`;
        }
        this.progressBarItem.show();
    }
    clearProgress() {
        this.progressBarItem.hide();
        this.progressBarItem.text = '';
    }
    updateStats(stats) {
        Object.assign(this.stats, stats);
        this.updateDisplay();
    }
    updateDisplay() {
        if (this.currentStatus === 'active') {
            // Update statistics display
            const parts = [];
            if (this.stats.concepts > 0) {
                parts.push(`$(symbol-namespace) ${this.stats.concepts}`);
            }
            if (this.stats.patterns > 0) {
                parts.push(`$(symbol-method) ${this.stats.patterns}`);
            }
            if (this.stats.lastOperation) {
                const timeStr = this.stats.operationTime > 0
                    ? ` (${this.stats.operationTime}ms)`
                    : '';
                parts.push(`${this.stats.lastOperation}${timeStr}`);
            }
            if (parts.length > 0) {
                this.statsBarItem.text = parts.join(' | ');
                this.statsBarItem.tooltip = `Concepts: ${this.stats.concepts}\n` +
                    `Patterns: ${this.stats.patterns}\n` +
                    `Last: ${this.stats.lastOperation} ${this.stats.operationTime}ms\n` +
                    `Click to show concept graph`;
                this.statsBarItem.show();
            }
        }
        else {
            this.statsBarItem.hide();
        }
    }
    dispose() {
        this.statusBarItem.dispose();
        this.progressBarItem.dispose();
        this.statsBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=StatusBarManager.js.map