/**
 * Core module - Entry point for the unified architecture
 * Export all main components and utilities
 */

// Core types
export * from './types.js';

// Learning system types
export type * from '../learning/types.js';

// Main analyzer components
export { CodeAnalyzer } from './unified-analyzer.js';
export { LayerManager, DefaultEventBus } from './layer-manager.js';
export { SharedServices } from './services/index.js';
export { AnalyzerFactory } from './analyzer-factory.js';

// Individual services
export {
  CacheService,
  DatabaseService,
  MonitoringService,
  EventBusService
} from './services/index.js';

// Learning system components
export {
  FeedbackLoopSystem,
  CodeEvolutionTracker,
  TeamKnowledgeSystem,
  LearningOrchestrator,
  createLearningSystem,
  LEARNING_SYSTEM_VERSION,
  LEARNING_SYSTEM_METADATA
} from '../learning/index.js';

// Convenience function to create a fully configured analyzer
export async function createUnifiedAnalyzer(
  workspacePath?: string,
  config?: Partial<import('./types.js').CoreConfig>
) {
  if (workspacePath) {
    return AnalyzerFactory.createWorkspaceAnalyzer(workspacePath, config);
  }
  return AnalyzerFactory.createAnalyzer(config);
}

// Convenience function for testing
export async function createTestAnalyzer() {
  return AnalyzerFactory.createTestAnalyzer();
}

// Convenience function to create a complete system with learning enabled
export async function createLearningEnabledAnalyzer(
  workspacePath?: string,
  config?: Partial<import('./types.js').CoreConfig>
): Promise<{
  analyzer: import('./unified-analyzer.js').CodeAnalyzer;
  learningSystem: import('../learning/learning-orchestrator.js').LearningOrchestrator;
}> {
  // Create the unified analyzer
  const analyzer = await createUnifiedAnalyzer(workspacePath, config);
  
  // Extract shared services from the analyzer
  const sharedServices = (analyzer as any).sharedServices;
  if (!sharedServices) {
    throw new Error('Shared services not available in analyzer');
  }
  
  // Create the learning system
  const learningSystem = await createLearningSystem({
    database: sharedServices.database,
    cache: sharedServices.cache,
    eventBus: sharedServices.eventBus,
    workspaceRoot: workspacePath || process.cwd()
  });
  
  return {
    analyzer,
    learningSystem
  };
}

// Convenience function that matches adapter expectations
export async function createCodeAnalyzer(
  config: Partial<import('./types.js').CoreConfig> & { workspaceRoot?: string }
): Promise<import('./unified-analyzer.js').CodeAnalyzer> {
  const { workspaceRoot, ...coreConfig } = config;
  
  if (workspaceRoot) {
    const result = await AnalyzerFactory.createWorkspaceAnalyzer(workspaceRoot, coreConfig);
    return result.analyzer;
  } else {
    const result = await AnalyzerFactory.createAnalyzer(coreConfig);
    return result.analyzer;
  }
}
