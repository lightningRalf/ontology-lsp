/**
 * Extension API
 * Public API for third-party extensions to integrate with Ontology LSP
 *
 * Sixth-order consideration: Extensibility for future AI integration and ecosystem growth
 */
import { LanguageClient } from 'vscode-languageclient/node';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { TelemetryManager } from '../telemetry/TelemetryManager';
import * as vscode from 'vscode';
export interface OntologyAPI {
    /**
     * Get concept information for a symbol at a given position
     */
    getConcept(uri: string, position: vscode.Position): Promise<ConceptInfo | null>;
    /**
     * Find related concepts to a given concept
     */
    findRelatedConcepts(conceptId: string): Promise<ConceptInfo[]>;
    /**
     * Get learned patterns
     */
    getPatterns(): Promise<Pattern[]>;
    /**
     * Train a new pattern
     */
    trainPattern(pattern: PatternDefinition): Promise<void>;
    /**
     * Suggest refactorings for a given position
     */
    suggestRefactorings(uri: string, position: vscode.Position): Promise<Refactoring[]>;
    /**
     * Apply a refactoring
     */
    applyRefactoring(refactoring: Refactoring): Promise<boolean>;
    /**
     * Register a custom propagation rule
     */
    registerPropagationRule(rule: PropagationRule): void;
    /**
     * Subscribe to ontology events
     */
    onConceptDiscovered(callback: (concept: ConceptInfo) => void): vscode.Disposable;
    onPatternLearned(callback: (pattern: Pattern) => void): vscode.Disposable;
    onRefactoringApplied(callback: (refactoring: Refactoring) => void): vscode.Disposable;
    /**
     * Get performance statistics
     */
    getStatistics(): Promise<Statistics>;
    /**
     * Export ontology data
     */
    exportOntology(): Promise<OntologyData>;
    /**
     * Import ontology data
     */
    importOntology(data: OntologyData): Promise<void>;
}
export interface ConceptInfo {
    id: string;
    name: string;
    type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'namespace';
    uri: string;
    range: vscode.Range;
    relationships: Relationship[];
    confidence: number;
    metadata: Record<string, any>;
}
export interface Relationship {
    type: 'uses' | 'usedBy' | 'extends' | 'implements' | 'references' | 'similar';
    targetId: string;
    confidence: number;
}
export interface Pattern {
    id: string;
    name: string;
    description: string;
    confidence: number;
    usageCount: number;
    example: string;
    applicableTo: string[];
}
export interface PatternDefinition {
    name: string;
    description: string;
    code: string;
    context?: Record<string, any>;
}
export interface Refactoring {
    id: string;
    title: string;
    description: string;
    confidence: number;
    changes: Change[];
}
export interface Change {
    uri: string;
    range: vscode.Range;
    newText: string;
}
export interface PropagationRule {
    name: string;
    description: string;
    matcher: (change: Change) => boolean;
    propagate: (change: Change) => Promise<Change[]>;
}
export interface Statistics {
    concepts: number;
    relationships: number;
    patterns: number;
    cacheHitRate: number;
    avgResponseTime: number;
    memoryUsage: number;
}
export interface OntologyData {
    version: string;
    concepts: ConceptInfo[];
    patterns: Pattern[];
    metadata: Record<string, any>;
}
export declare class ExtensionAPI implements OntologyAPI {
    private client;
    private config;
    private telemetry;
    private eventEmitter;
    private customRules;
    constructor(client: LanguageClient | undefined, config: ConfigurationManager, telemetry: TelemetryManager | undefined);
    getConcept(uri: string, position: vscode.Position): Promise<ConceptInfo | null>;
    findRelatedConcepts(conceptId: string): Promise<ConceptInfo[]>;
    getPatterns(): Promise<Pattern[]>;
    trainPattern(pattern: PatternDefinition): Promise<void>;
    suggestRefactorings(uri: string, position: vscode.Position): Promise<Refactoring[]>;
    applyRefactoring(refactoring: Refactoring): Promise<boolean>;
    registerPropagationRule(rule: PropagationRule): void;
    onConceptDiscovered(callback: (concept: ConceptInfo) => void): vscode.Disposable;
    onPatternLearned(callback: (pattern: Pattern) => void): vscode.Disposable;
    onRefactoringApplied(callback: (refactoring: Refactoring) => void): vscode.Disposable;
    getStatistics(): Promise<Statistics>;
    exportOntology(): Promise<OntologyData>;
    importOntology(data: OntologyData): Promise<void>;
    private setupEventHandlers;
    private convertConcept;
    private convertRefactoring;
    private convertChange;
    /**
     * Advanced API for AI integration (future-proofing)
     */
    analyzeWithAI(code: string, prompt: string): Promise<any>;
    /**
     * Get the raw language client for advanced usage
     */
    getLanguageClient(): LanguageClient | undefined;
    /**
     * Get configuration
     */
    getConfiguration(): Record<string, any>;
}
//# sourceMappingURL=ExtensionAPI.d.ts.map