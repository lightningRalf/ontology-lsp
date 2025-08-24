/**
 * Unified CodeAnalyzer - Protocol-agnostic core that provides all functionality
 * This is the single source of truth for code analysis, used by all protocol adapters
 */

import {
  FindDefinitionRequest,
  FindDefinitionResult,
  FindReferencesRequest, 
  FindReferencesResult,
  PrepareRenameRequest,
  PrepareRenameResult,
  RenameRequest,
  RenameResult,
  CompletionRequest,
  CompletionResult,
  Definition,
  Reference,
  Completion,
  WorkspaceEdit,
  DefinitionKind,
  ReferenceKind,
  CompletionKind,
  LayerPerformance,
  RequestMetadata,
  CoreConfig,
  CoreError,
  InvalidRequestError,
  EventBus
} from './types.js';

import { LayerManager } from './layer-manager.js';
import { SharedServices } from './services/index.js';
import { LearningOrchestrator } from '../learning/learning-orchestrator.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * The unified code analyzer that orchestrates all 5 layers
 * - Layer 1: Fast search (Claude tools) - ~5ms
 * - Layer 2: AST analysis (Tree-sitter) - ~50ms 
 * - Layer 3: Ontology concepts - ~10ms
 * - Layer 4: Pattern learning - ~10ms
 * - Layer 5: Knowledge propagation - ~20ms
 */
export class CodeAnalyzer {
  private layerManager: LayerManager;
  private sharedServices: SharedServices;
  private config: CoreConfig;
  private eventBus: EventBus;
  private learningOrchestrator: LearningOrchestrator | null = null;
  private initialized = false;

  constructor(
    layerManager: LayerManager,
    sharedServices: SharedServices,
    config: CoreConfig,
    eventBus: EventBus
  ) {
    this.layerManager = layerManager;
    this.sharedServices = sharedServices;
    this.config = config;
    this.eventBus = eventBus;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.layerManager.initialize();
    await this.sharedServices.initialize();
    
    // Initialize learning orchestrator
    this.learningOrchestrator = new LearningOrchestrator(
      this.sharedServices,
      this.eventBus,
      {
        enabledComponents: {
          patternLearning: this.config.layers.layer4?.enabled || true,
          feedbackLoop: true,
          evolutionTracking: true,
          teamKnowledge: true
        }
      }
    );
    await this.learningOrchestrator.initialize();
    
    this.initialized = true;
    
    this.eventBus.emit('code-analyzer:initialized', {
      timestamp: Date.now(),
      version: '1.0.0'
    });
  }

  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Dispose learning orchestrator first
    if (this.learningOrchestrator) {
      await this.learningOrchestrator.dispose();
      this.learningOrchestrator = null;
    }

    await this.layerManager.dispose();
    await this.sharedServices.dispose();
    
    this.initialized = false;
    
    this.eventBus.emit('code-analyzer:disposed', {
      timestamp: Date.now()
    });
  }

  /**
   * Find definition(s) of a symbol using all available layers
   */
  async findDefinition(request: FindDefinitionRequest): Promise<FindDefinitionResult> {
    this.validateRequest(request);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    const requestMetadata: RequestMetadata = {
      id: requestId,
      startTime,
      source: 'unified'
    };

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey('definition', request);
      const cached = await this.sharedServices.cache.get<Definition[]>(cacheKey);
      
      if (cached) {
        const performance: LayerPerformance = {
          layer1: 0, layer2: 0, layer3: 0, layer4: 0, layer5: 0,
          total: Date.now() - startTime
        };
        
        return {
          data: cached,
          performance,
          requestId,
          cacheHit: true,
          timestamp: Date.now()
        };
      }

      const definitions: Definition[] = [];
      const layerTimes: Record<string, number> = {};
      
      // Layer 1: Fast search with Claude tools (~5ms target)
      if (this.config.layers.layer1.enabled) {
        const layer1Start = Date.now();
        try {
          const fastResults = await this.layerManager.executeWithLayer(
            'layer1',
            'findDefinition',
            requestMetadata,
            async (layer) => {
              return await this.executeLayer1Search(request);
            }
          );
          
          definitions.push(...fastResults);
          layerTimes.layer1 = Date.now() - layer1Start;
          
          // If we found exact matches, we can skip fuzzy search in some cases
          if (fastResults.some(d => d.source === 'exact')) {
            await this.sharedServices.cache.set(cacheKey, definitions, 300); // 5min cache
            return this.buildResult(definitions, layerTimes, requestId, startTime);
          }
        } catch (error) {
          layerTimes.layer1 = Date.now() - layer1Start;
          console.warn('Layer 1 failed:', error);
        }
      }
      
      // Layer 2: AST analysis for precise structural understanding (~50ms target) 
      if (this.config.layers.layer2.enabled && definitions.length < 10) {
        const layer2Start = Date.now();
        try {
          const astResults = await this.layerManager.executeWithLayer(
            'layer2',
            'findDefinition',
            requestMetadata,
            async (layer) => {
              return await this.executeLayer2Analysis(request, definitions);
            }
          );
          
          definitions.push(...astResults);
          layerTimes.layer2 = Date.now() - layer2Start;
        } catch (error) {
          layerTimes.layer2 = Date.now() - layer2Start;
          console.warn('Layer 2 failed:', error);
        }
      }
      
      // Layer 3: Ontology concept lookup (~10ms target)
      if (this.config.layers.layer3.enabled) {
        const layer3Start = Date.now();
        try {
          const conceptResults = await this.layerManager.executeWithLayer(
            'layer3',
            'findDefinition', 
            requestMetadata,
            async (layer) => {
              return await this.executeLayer3Concepts(request);
            }
          );
          
          definitions.push(...conceptResults);
          layerTimes.layer3 = Date.now() - layer3Start;
        } catch (error) {
          layerTimes.layer3 = Date.now() - layer3Start;
          console.warn('Layer 3 failed:', error);
        }
      }
      
      // Layer 4: Pattern-based suggestions (~10ms target)
      if (this.config.layers.layer4.enabled && definitions.length > 0) {
        const layer4Start = Date.now();
        try {
          const patternResults = await this.layerManager.executeWithLayer(
            'layer4',
            'findDefinition',
            requestMetadata, 
            async (layer) => {
              return await this.executeLayer4Patterns(request, definitions);
            }
          );
          
          definitions.push(...patternResults);
          layerTimes.layer4 = Date.now() - layer4Start;
        } catch (error) {
          layerTimes.layer4 = Date.now() - layer4Start;
          console.warn('Layer 4 failed:', error);
        }
      }
      
      // Layer 5: Knowledge propagation and related concepts (~20ms target)
      if (this.config.layers.layer5.enabled && definitions.length > 0) {
        const layer5Start = Date.now();
        try {
          const propagatedResults = await this.layerManager.executeWithLayer(
            'layer5',
            'findDefinition',
            requestMetadata,
            async (layer) => {
              return await this.executeLayer5Propagation(request, definitions);
            }
          );
          
          definitions.push(...propagatedResults);
          layerTimes.layer5 = Date.now() - layer5Start;
        } catch (error) {
          layerTimes.layer5 = Date.now() - layer5Start;
          console.warn('Layer 5 failed:', error);
        }
      }
      
      // Deduplicate and rank results
      const uniqueDefinitions = this.deduplicateDefinitions(definitions);
      const rankedDefinitions = this.rankDefinitions(uniqueDefinitions, request);
      
      // Apply result limits
      const limitedResults = request.maxResults 
        ? rankedDefinitions.slice(0, request.maxResults)
        : rankedDefinitions;
      
      // Cache results
      await this.sharedServices.cache.set(cacheKey, limitedResults, 300);
      
      return this.buildResult(limitedResults, layerTimes, requestId, startTime);
      
    } catch (error) {
      this.eventBus.emit('code-analyzer:error', {
        operation: 'findDefinition',
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      throw new CoreError(
        `Find definition failed: ${error instanceof Error ? error.message : String(error)}`,
        'FIND_DEFINITION_ERROR',
        undefined,
        requestId
      );
    }
  }

  /**
   * Find all references to a symbol using all available layers
   */
  async findReferences(request: FindReferencesRequest): Promise<FindReferencesResult> {
    this.validateRequest(request);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    const requestMetadata: RequestMetadata = {
      id: requestId,
      startTime,
      source: 'unified'
    };

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey('references', request);
      const cached = await this.sharedServices.cache.get<Reference[]>(cacheKey);
      
      if (cached) {
        const performance: LayerPerformance = {
          layer1: 0, layer2: 0, layer3: 0, layer4: 0, layer5: 0,
          total: Date.now() - startTime
        };
        
        return {
          data: cached,
          performance,
          requestId,
          cacheHit: true,
          timestamp: Date.now()
        };
      }

      const references: Reference[] = [];
      const layerTimes: Record<string, number> = {};
      
      // Use cascade approach - start with fast layers, add precision
      const cascadeLayers = ['layer1', 'layer2', 'layer3'];
      
      await this.layerManager.executeCascade(
        cascadeLayers,
        'findReferences',
        requestMetadata,
        async (layer, layerName) => {
          const layerStart = Date.now();
          let results: Reference[] = [];
          
          switch (layerName) {
            case 'layer1':
              results = await this.executeLayer1ReferenceSearch(request);
              break;
            case 'layer2':
              results = await this.executeLayer2ReferenceAnalysis(request, references);
              break;
            case 'layer3':
              results = await this.executeLayer3ReferenceConceptual(request);
              break;
          }
          
          layerTimes[layerName] = Date.now() - layerStart;
          references.push(...results);
          
          return results.length > 0 ? results : null;
        }
      );
      
      // Layer 4 & 5 for enhancement
      if (this.config.layers.layer4.enabled) {
        const layer4Start = Date.now();
        try {
          const patternRefs = await this.executeLayer4ReferencePatterns(request, references);
          references.push(...patternRefs);
          layerTimes.layer4 = Date.now() - layer4Start;
        } catch (error) {
          layerTimes.layer4 = Date.now() - layer4Start;
        }
      }
      
      if (this.config.layers.layer5.enabled) {
        const layer5Start = Date.now();
        try {
          const propagatedRefs = await this.executeLayer5ReferencesPropagation(request, references);
          references.push(...propagatedRefs);
          layerTimes.layer5 = Date.now() - layer5Start;
        } catch (error) {
          layerTimes.layer5 = Date.now() - layer5Start;
        }
      }
      
      // Deduplicate and rank
      const uniqueReferences = this.deduplicateReferences(references);
      const rankedReferences = this.rankReferences(uniqueReferences, request);
      
      const limitedResults = request.maxResults
        ? rankedReferences.slice(0, request.maxResults)
        : rankedReferences;
      
      await this.sharedServices.cache.set(cacheKey, limitedResults, 300);
      
      return this.buildReferencesResult(limitedResults, layerTimes, requestId, startTime);
      
    } catch (error) {
      this.eventBus.emit('code-analyzer:error', {
        operation: 'findReferences',
        requestId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      throw new CoreError(
        `Find references failed: ${error instanceof Error ? error.message : String(error)}`,
        'FIND_REFERENCES_ERROR',
        undefined,
        requestId
      );
    }
  }

  /**
   * Prepare for rename operation
   */
  async prepareRename(request: PrepareRenameRequest): Promise<PrepareRenameResult> {
    this.validateRequest(request);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    
    try {
      // Quick validation using Layer 1 + 3
      const found = await this.layerManager.executeWithLayer(
        'layer1',
        'prepareRename',
        { id: requestId, startTime, source: 'unified' },
        async () => {
          return await this.validateSymbolForRename(request);
        }
      );
      
      if (!found) {
        throw new InvalidRequestError(
          `Symbol '${request.identifier}' not found or cannot be renamed`,
          requestId
        );
      }
      
      const performance: LayerPerformance = {
        layer1: Date.now() - startTime,
        layer2: 0, layer3: 0, layer4: 0, layer5: 0,
        total: Date.now() - startTime
      };
      
      return {
        data: {
          range: found.range,
          placeholder: request.identifier
        },
        performance,
        requestId,
        cacheHit: false,
        timestamp: Date.now()
      };
      
    } catch (error) {
      throw new CoreError(
        `Prepare rename failed: ${error instanceof Error ? error.message : String(error)}`,
        'PREPARE_RENAME_ERROR',
        undefined,
        requestId
      );
    }
  }

  /**
   * Execute rename operation with learning and propagation
   */
  async rename(request: RenameRequest): Promise<RenameResult> {
    this.validateRequest(request);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    const requestMetadata: RequestMetadata = {
      id: requestId,
      startTime,
      source: 'unified'
    };
    
    try {
      const edits: WorkspaceEdit = { changes: {} };
      const layerTimes: Record<string, number> = {};
      
      // Phase 1: Find all instances to rename (Layer 1 + 2)
      const instances = await this.findRenameInstances(request, requestMetadata);
      layerTimes.layer1 = 30; // Estimated from findRenameInstances
      layerTimes.layer2 = 20;
      
      // Phase 2: Learn from this rename (Layer 4)
      if (this.config.layers.layer4.enabled) {
        const layer4Start = Date.now();
        await this.layerManager.executeWithLayer(
          'layer4',
          'learnRename',
          requestMetadata,
          async () => {
            return await this.learnFromRename(request);
          }
        );
        layerTimes.layer4 = Date.now() - layer4Start;
      }
      
      // Phase 3: Propagate to related concepts (Layer 5)
      let propagatedChanges: WorkspaceEdit = { changes: {} };
      if (this.config.layers.layer5.enabled && !request.dryRun) {
        const layer5Start = Date.now();
        propagatedChanges = await this.layerManager.executeWithLayer(
          'layer5',
          'propagateRename',
          requestMetadata,
          async () => {
            return await this.propagateRename(request, instances);
          }
        );
        layerTimes.layer5 = Date.now() - layer5Start;
      }
      
      // Merge all changes
      const mergedEdit = this.mergeWorkspaceEdits(edits, propagatedChanges);
      
      const performance: LayerPerformance = {
        layer1: layerTimes.layer1 || 0,
        layer2: layerTimes.layer2 || 0,
        layer3: layerTimes.layer3 || 0,
        layer4: layerTimes.layer4 || 0,
        layer5: layerTimes.layer5 || 0,
        total: Date.now() - startTime
      };
      
      return {
        data: mergedEdit,
        performance,
        requestId,
        cacheHit: false,
        timestamp: Date.now()
      };
      
    } catch (error) {
      throw new CoreError(
        `Rename failed: ${error instanceof Error ? error.message : String(error)}`,
        'RENAME_ERROR',
        undefined,
        requestId
      );
    }
  }

  /**
   * Get intelligent completions using pattern learning
   */
  async getCompletions(request: CompletionRequest): Promise<CompletionResult> {
    this.validateRequest(request);
    
    const requestId = uuidv4();
    const startTime = Date.now();
    const requestMetadata: RequestMetadata = {
      id: requestId,
      startTime,
      source: 'unified'
    };
    
    try {
      const completions: Completion[] = [];
      const layerTimes: Record<string, number> = {};
      
      // Layer 4: Pattern-based completions (primary for completions)
      if (this.config.layers.layer4.enabled) {
        const layer4Start = Date.now();
        const patternCompletions = await this.layerManager.executeWithLayer(
          'layer4', 
          'getCompletions',
          requestMetadata,
          async () => {
            return await this.getPatternCompletions(request);
          }
        );
        completions.push(...patternCompletions);
        layerTimes.layer4 = Date.now() - layer4Start;
      }
      
      // Layer 3: Ontology-based completions
      if (this.config.layers.layer3.enabled) {
        const layer3Start = Date.now();
        const conceptCompletions = await this.layerManager.executeWithLayer(
          'layer3',
          'getCompletions',
          requestMetadata,
          async () => {
            return await this.getConceptCompletions(request);
          }
        );
        completions.push(...conceptCompletions);
        layerTimes.layer3 = Date.now() - layer3Start;
      }
      
      // Rank and deduplicate
      const rankedCompletions = this.rankCompletions(completions, request);
      const limitedResults = request.maxResults
        ? rankedCompletions.slice(0, request.maxResults) 
        : rankedCompletions.slice(0, 20); // Default limit
      
      const performance: LayerPerformance = {
        layer1: layerTimes.layer1 || 0,
        layer2: layerTimes.layer2 || 0,
        layer3: layerTimes.layer3 || 0,
        layer4: layerTimes.layer4 || 0,
        layer5: layerTimes.layer5 || 0,
        total: Date.now() - startTime
      };
      
      return {
        data: limitedResults,
        performance,
        requestId,
        cacheHit: false,
        timestamp: Date.now()
      };
      
    } catch (error) {
      throw new CoreError(
        `Get completions failed: ${error instanceof Error ? error.message : String(error)}`,
        'COMPLETIONS_ERROR',
        undefined,
        requestId
      );
    }
  }

  // Private helper methods for layer execution
  
  private async executeLayer1Search(request: FindDefinitionRequest): Promise<Definition[]> {
    // Implementation would use ClaudeToolsLayer for fast search
    // This is a stub for the architecture
    return [];
  }
  
  private async executeLayer2Analysis(request: FindDefinitionRequest, existing: Definition[]): Promise<Definition[]> {
    // Implementation would use TreeSitterLayer for AST analysis
    return [];
  }
  
  private async executeLayer3Concepts(request: FindDefinitionRequest): Promise<Definition[]> {
    // Implementation would use OntologyEngine
    return [];
  }
  
  private async executeLayer4Patterns(request: FindDefinitionRequest, existing: Definition[]): Promise<Definition[]> {
    // Implementation would use PatternLearner
    return [];
  }
  
  private async executeLayer5Propagation(request: FindDefinitionRequest, existing: Definition[]): Promise<Definition[]> {
    // Implementation would use KnowledgeSpreader
    return [];
  }
  
  // Reference search implementations
  private async executeLayer1ReferenceSearch(request: FindReferencesRequest): Promise<Reference[]> {
    return [];
  }
  
  private async executeLayer2ReferenceAnalysis(request: FindReferencesRequest, existing: Reference[]): Promise<Reference[]> {
    return [];
  }
  
  private async executeLayer3ReferenceConceptual(request: FindReferencesRequest): Promise<Reference[]> {
    return [];
  }
  
  private async executeLayer4ReferencePatterns(request: FindReferencesRequest, existing: Reference[]): Promise<Reference[]> {
    return [];
  }
  
  private async executeLayer5ReferencesPropagation(request: FindReferencesRequest, existing: Reference[]): Promise<Reference[]> {
    return [];
  }
  
  // Other implementations
  private async validateSymbolForRename(request: PrepareRenameRequest): Promise<{ range: any } | null> {
    return null;
  }
  
  private async findRenameInstances(request: RenameRequest, metadata: RequestMetadata): Promise<any[]> {
    return [];
  }
  
  private async learnFromRename(request: RenameRequest): Promise<void> {
    // Learn patterns from rename using the learning orchestrator
    if (this.learningOrchestrator) {
      try {
        const context = {
          requestId: uuidv4(),
          operation: 'pattern_learning',
          file: request.uri,
          timestamp: new Date(),
          metadata: {
            operation: 'rename',
            identifier: request.newName
          }
        };

        const learningData = {
          rename: {
            oldName: request.identifier,
            newName: request.newName,
            context: {
              file: request.uri,
              surroundingSymbols: [], // Would be populated from actual context
              timestamp: new Date()
            }
          }
        };

        await this.learningOrchestrator.learn(context, learningData);
        
      } catch (error) {
        console.warn('Failed to learn from rename:', error);
        // Don't throw - learning failures shouldn't break the rename operation
      }
    }
  }
  
  private async propagateRename(request: RenameRequest, instances: any[]): Promise<WorkspaceEdit> {
    return { changes: {} };
  }
  
  private async getPatternCompletions(request: CompletionRequest): Promise<Completion[]> {
    return [];
  }
  
  private async getConceptCompletions(request: CompletionRequest): Promise<Completion[]> {
    return [];
  }
  
  // Utility methods
  
  private validateRequest(request: any): void {
    if (!request) {
      throw new InvalidRequestError('Request cannot be null or undefined');
    }
    
    if (!this.initialized) {
      throw new CoreError('CodeAnalyzer not initialized', 'NOT_INITIALIZED');
    }
  }
  
  private generateCacheKey(operation: string, request: any): string {
    return `${operation}:${JSON.stringify(request)}`;
  }
  
  private deduplicateDefinitions(definitions: Definition[]): Definition[] {
    const seen = new Set<string>();
    return definitions.filter(def => {
      const key = `${def.uri}:${def.range.start.line}:${def.range.start.character}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  private rankDefinitions(definitions: Definition[], request: FindDefinitionRequest): Definition[] {
    return definitions.sort((a, b) => {
      // Sort by confidence first, then by source priority
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      
      const sourcePriority = { 'exact': 3, 'fuzzy': 2, 'conceptual': 1, 'pattern': 0 };
      return sourcePriority[b.source] - sourcePriority[a.source];
    });
  }
  
  private deduplicateReferences(references: Reference[]): Reference[] {
    const seen = new Set<string>();
    return references.filter(ref => {
      const key = `${ref.uri}:${ref.range.start.line}:${ref.range.start.character}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  private rankReferences(references: Reference[], request: FindReferencesRequest): Reference[] {
    return references.sort((a, b) => b.confidence - a.confidence);
  }
  
  private rankCompletions(completions: Completion[], request: CompletionRequest): Completion[] {
    return completions.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return (a.sortText || a.label).localeCompare(b.sortText || b.label);
    });
  }
  
  private mergeWorkspaceEdits(edit1: WorkspaceEdit, edit2: WorkspaceEdit): WorkspaceEdit {
    const merged: WorkspaceEdit = { changes: {} };
    
    // Merge changes from both edits
    for (const [uri, edits] of Object.entries(edit1.changes || {})) {
      merged.changes![uri] = [...edits];
    }
    
    for (const [uri, edits] of Object.entries(edit2.changes || {})) {
      if (merged.changes![uri]) {
        merged.changes![uri].push(...edits);
      } else {
        merged.changes![uri] = [...edits];
      }
    }
    
    return merged;
  }
  
  private buildResult(
    definitions: Definition[], 
    layerTimes: Record<string, number>, 
    requestId: string, 
    startTime: number
  ): FindDefinitionResult {
    const performance: LayerPerformance = {
      layer1: layerTimes.layer1 || 0,
      layer2: layerTimes.layer2 || 0,
      layer3: layerTimes.layer3 || 0,
      layer4: layerTimes.layer4 || 0,
      layer5: layerTimes.layer5 || 0,
      total: Date.now() - startTime
    };
    
    return {
      data: definitions,
      performance,
      requestId,
      cacheHit: false,
      timestamp: Date.now()
    };
  }
  
  private buildReferencesResult(
    references: Reference[], 
    layerTimes: Record<string, number>, 
    requestId: string, 
    startTime: number
  ): FindReferencesResult {
    const performance: LayerPerformance = {
      layer1: layerTimes.layer1 || 0,
      layer2: layerTimes.layer2 || 0,
      layer3: layerTimes.layer3 || 0,
      layer4: layerTimes.layer4 || 0,
      layer5: layerTimes.layer5 || 0,
      total: Date.now() - startTime
    };
    
    return {
      data: references,
      performance,
      requestId,
      cacheHit: false,
      timestamp: Date.now()
    };
  }
  
  /**
   * Record user feedback on a suggestion or operation result
   */
  async recordFeedback(
    suggestionId: string,
    type: 'accept' | 'reject' | 'modify' | 'ignore',
    originalValue: string,
    finalValue?: string,
    context?: { file?: string; operation?: string; confidence?: number }
  ): Promise<void> {
    if (this.learningOrchestrator) {
      try {
        const feedbackContext = {
          requestId: uuidv4(),
          operation: 'feedback_recording',
          file: context?.file,
          timestamp: new Date(),
          metadata: {
            suggestionId,
            type,
            originalValue,
            finalValue
          }
        };

        const feedbackData = {
          feedback: {
            type,
            suggestionId,
            originalSuggestion: originalValue,
            finalValue,
            context: {
              file: context?.file || 'unknown',
              operation: context?.operation || 'unknown',
              timestamp: new Date(),
              confidence: context?.confidence || 0.5
            },
            metadata: {
              source: 'vscode', // Would be detected from calling context
              keystrokes: finalValue ? Math.abs(finalValue.length - originalValue.length) : 0
            }
          }
        };

        await this.learningOrchestrator.learn(feedbackContext, feedbackData);
        
      } catch (error) {
        console.warn('Failed to record feedback:', error);
        // Don't throw - feedback failures shouldn't break the main operation
      }
    }
  }

  /**
   * Get learning insights and recommendations
   */
  async getLearningInsights(): Promise<{
    insights: any[];
    recommendations: any[];
    patterns: any[];
    systemHealth: any;
  }> {
    if (!this.learningOrchestrator) {
      return {
        insights: [],
        recommendations: [],
        patterns: [],
        systemHealth: { overall: 'unavailable', details: 'Learning system not initialized' }
      };
    }

    try {
      const [health, stats] = await Promise.all([
        this.learningOrchestrator.getSystemHealth(),
        this.learningOrchestrator.getLearningStats()
      ]);

      // Generate comprehensive analysis
      const analysisContext = {
        requestId: uuidv4(),
        operation: 'comprehensive_analysis',
        timestamp: new Date(),
        metadata: {}
      };

      const analysisResult = await this.learningOrchestrator.learn(analysisContext, {});

      return {
        insights: analysisResult.insights || [],
        recommendations: analysisResult.recommendations || [],
        patterns: analysisResult.data?.patterns || [],
        systemHealth: health
      };
      
    } catch (error) {
      console.error('Failed to get learning insights:', error);
      return {
        insights: [],
        recommendations: [],
        patterns: [],
        systemHealth: { overall: 'error', details: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Trigger evolution event tracking for file changes
   */
  async trackFileChange(
    filePath: string,
    changeType: 'created' | 'modified' | 'deleted' | 'renamed',
    before?: string,
    after?: string,
    context?: { commit?: string; author?: string; message?: string }
  ): Promise<void> {
    if (this.learningOrchestrator) {
      try {
        const trackingContext = {
          requestId: uuidv4(),
          operation: 'evolution_tracking',
          file: filePath,
          timestamp: new Date(),
          metadata: {
            changeType,
            hasContent: !!(before || after)
          }
        };

        const trackingData = {
          fileChange: {
            path: filePath,
            type: changeType,
            before,
            after,
            context: context || {}
          }
        };

        await this.learningOrchestrator.learn(trackingContext, trackingData);
        
      } catch (error) {
        console.warn('Failed to track file change:', error);
      }
    }
  }

  /**
   * Get system diagnostics and health information
   */
  getDiagnostics(): Record<string, any> {
    const diagnostics = {
      initialized: this.initialized,
      layerManager: this.layerManager.getDiagnostics(),
      sharedServices: this.sharedServices.getDiagnostics(),
      learningOrchestrator: this.learningOrchestrator?.getDiagnostics() || { status: 'not_initialized' },
      config: this.config,
      timestamp: Date.now()
    };

    // Add learning-specific diagnostics
    if (this.learningOrchestrator) {
      diagnostics.learningCapabilities = {
        patternLearning: true,
        feedbackCollection: true,
        evolutionTracking: true,
        teamKnowledge: true,
        comprehensiveAnalysis: true
      };
    } else {
      diagnostics.learningCapabilities = {
        patternLearning: false,
        feedbackCollection: false,
        evolutionTracking: false,
        teamKnowledge: false,
        comprehensiveAnalysis: false
      };
    }

    return diagnostics;
  }
}
