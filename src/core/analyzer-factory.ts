/**
 * AnalyzerFactory - Factory for creating and configuring the unified analyzer
 * This provides a clean interface for protocol adapters to initialize the system
 */

import {
  CoreConfig,
  LayerConfigs,
  PerformanceConfig,
  CacheConfig,
  MonitoringConfig,
  Layer
} from './types.js';

import { CodeAnalyzer } from './unified-analyzer.js';
import { LayerManager, DefaultEventBus } from './layer-manager.js';
import { SharedServices } from './services/index.js';

// Import existing layer implementations
import { ClaudeToolsLayer } from '../layers/claude-tools.js';
import { TreeSitterLayer } from '../layers/tree-sitter.js';
import { OntologyEngine } from '../ontology/ontology-engine.js';
import { PatternLearner } from '../patterns/pattern-learner.js';
import { KnowledgeSpreader } from '../propagation/knowledge-spreader.js';

/**
 * Layer adapter interface to wrap existing implementations
 */
abstract class LayerAdapter implements Layer {
  abstract name: string;
  abstract version: string;
  abstract targetLatency: number;
  
  async initialize(): Promise<void> {
    // Default implementation - override if needed
  }
  
  async dispose(): Promise<void> {
    // Default implementation - override if needed
  }
  
  isHealthy(): boolean {
    return true; // Override if health checks are available
  }
  
  getMetrics(): any {
    return {
      name: this.name,
      requestCount: 0,
      averageLatency: 0,
      p95Latency: 0,
      errorCount: 0,
      cacheHitRate: 0
    };
  }
}

/**
 * Adapter for existing ClaudeToolsLayer
 */
class Layer1Adapter extends LayerAdapter {
  name = 'layer1';
  version = '1.0.0';
  targetLatency = 5; // 5ms target
  
  private claudeTools: ClaudeToolsLayer;
  
  constructor(config: any) {
    super();
    this.claudeTools = new ClaudeToolsLayer(config);
  }
  
  getClaudeTools(): ClaudeToolsLayer {
    return this.claudeTools;
  }
}

/**
 * Adapter for existing TreeSitterLayer
 */
class Layer2Adapter extends LayerAdapter {
  name = 'layer2';
  version = '1.0.0';
  targetLatency = 50; // 50ms target
  
  private treeSitter: TreeSitterLayer;
  
  constructor(config: any) {
    super();
    this.treeSitter = new TreeSitterLayer(config);
  }
  
  getTreeSitter(): TreeSitterLayer {
    return this.treeSitter;
  }
}

/**
 * Adapter for existing OntologyEngine
 */
class Layer3Adapter extends LayerAdapter {
  name = 'layer3';
  version = '1.0.0';
  targetLatency = 10; // 10ms target
  
  private ontology: OntologyEngine;
  
  constructor(dbPath: string) {
    super();
    this.ontology = new OntologyEngine(dbPath);
  }
  
  getOntologyEngine(): OntologyEngine {
    return this.ontology;
  }
}

/**
 * Adapter for existing PatternLearner
 */
class Layer4Adapter extends LayerAdapter {
  name = 'layer4';
  version = '1.0.0';
  targetLatency = 10; // 10ms target
  
  private patternLearner: PatternLearner;
  
  constructor(dbPath: string, config: any) {
    super();
    this.patternLearner = new PatternLearner(dbPath, config);
  }
  
  getPatternLearner(): PatternLearner {
    return this.patternLearner;
  }
}

/**
 * Adapter for existing KnowledgeSpreader
 */
class Layer5Adapter extends LayerAdapter {
  name = 'layer5';
  version = '1.0.0';
  targetLatency = 20; // 20ms target
  
  private knowledgeSpreader: KnowledgeSpreader;
  
  constructor(ontology: OntologyEngine, patternLearner: PatternLearner) {
    super();
    this.knowledgeSpreader = new KnowledgeSpreader(ontology, patternLearner);
  }
  
  getKnowledgeSpreader(): KnowledgeSpreader {
    return this.knowledgeSpreader;
  }
}

/**
 * Factory for creating the unified analyzer with all components
 */
export class AnalyzerFactory {
  /**
   * Create a default configuration suitable for most use cases
   */
  static createDefaultConfig(): CoreConfig {
    const config: CoreConfig = {
      layers: {
        layer1: {
          enabled: true,
          timeout: 10, // 2x target latency
          maxResults: 100,
          fileTypes: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rust'],
          optimization: {
            bloomFilter: true,
            frequencyCache: true,
            negativeLookup: true
          }
        },
        layer2: {
          enabled: true,
          timeout: 100, // 2x target latency
          languages: ['typescript', 'javascript', 'python'],
          maxFileSize: 1024 * 1024, // 1MB
          parseTimeout: 50
        },
        layer3: {
          enabled: true,
          dbPath: '.ontology/ontology.db',
          cacheSize: 1000,
          conceptThreshold: 0.7,
          relationshipDepth: 3
        },
        layer4: {
          enabled: true,
          learningThreshold: 3,
          confidenceThreshold: 0.7,
          maxPatterns: 1000,
          decayRate: 0.95
        },
        layer5: {
          enabled: true,
          maxDepth: 3,
          autoApplyThreshold: 0.9,
          propagationTimeout: 40
        }
      },
      performance: {
        targetLatency: 100,
        maxConcurrentRequests: 10,
        requestTimeout: 5000,
        circuitBreakerThreshold: 5,
        healthCheckInterval: 30000
      },
      cache: {
        enabled: true,
        strategy: 'memory',
        memory: {
          maxSize: 100 * 1024 * 1024, // 100MB
          ttl: 300 // 5 minutes
        }
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000, // 1 minute
        logLevel: 'info',
        tracing: {
          enabled: false,
          sampleRate: 0.1
        }
      }
    };
    
    return config;
  }
  
  /**
   * Create a unified analyzer with all layers configured
   */
  static async createAnalyzer(config?: Partial<CoreConfig>): Promise<{
    analyzer: CodeAnalyzer;
    layerManager: LayerManager;
    sharedServices: SharedServices;
  }> {
    // Merge with default config
    const fullConfig = {
      ...AnalyzerFactory.createDefaultConfig(),
      ...config
    } as CoreConfig;
    
    // Create event bus
    const eventBus = new DefaultEventBus();
    
    // Create layer manager
    const layerManager = new LayerManager(fullConfig, eventBus);
    
    // Create shared services
    const sharedServices = new SharedServices(fullConfig, eventBus);
    
    // Create and register layer adapters
    const layer1 = new Layer1Adapter({
      grep: {
        defaultTimeout: fullConfig.layers.layer1.timeout,
        maxResults: fullConfig.layers.layer1.maxResults,
        caseSensitive: false,
        includeContext: true,
        contextLines: 3
      },
      glob: {
        defaultTimeout: fullConfig.layers.layer1.timeout,
        maxFiles: 1000,
        ignorePatterns: ['node_modules/**', '.git/**']
      },
      ls: {
        defaultTimeout: fullConfig.layers.layer1.timeout,
        maxDepth: 10,
        followSymlinks: false,
        includeDotfiles: false
      },
      optimization: fullConfig.layers.layer1.optimization,
      caching: {
        enabled: true,
        ttl: 3600,
        maxEntries: 1000
      }
    });
    
    const layer2 = new Layer2Adapter({
      enabled: fullConfig.layers.layer2.enabled,
      timeout: fullConfig.layers.layer2.timeout,
      languages: fullConfig.layers.layer2.languages,
      maxFileSize: fullConfig.layers.layer2.maxFileSize.toString()
    });
    
    const layer3 = new Layer3Adapter(fullConfig.layers.layer3.dbPath);
    
    const layer4 = new Layer4Adapter(fullConfig.layers.layer3.dbPath, {
      learningThreshold: fullConfig.layers.layer4.learningThreshold,
      confidenceThreshold: fullConfig.layers.layer4.confidenceThreshold
    });
    
    const layer5 = new Layer5Adapter(
      layer3.getOntologyEngine(),
      layer4.getPatternLearner()
    );
    
    // Register all layers
    layerManager.registerLayer(layer1);
    layerManager.registerLayer(layer2);
    layerManager.registerLayer(layer3);
    layerManager.registerLayer(layer4);
    layerManager.registerLayer(layer5);
    
    // Create the unified analyzer
    const analyzer = new CodeAnalyzer(
      layerManager,
      sharedServices,
      fullConfig,
      eventBus
    );
    
    // Initialize everything
    await analyzer.initialize();
    
    return {
      analyzer,
      layerManager,
      sharedServices
    };
  }
  
  /**
   * Create analyzer with specific workspace path
   */
  static async createWorkspaceAnalyzer(
    workspacePath: string,
    config?: Partial<CoreConfig>
  ): Promise<{
    analyzer: CodeAnalyzer;
    layerManager: LayerManager;
    sharedServices: SharedServices;
  }> {
    const workspaceConfig = {
      ...config,
      layers: {
        ...config?.layers,
        layer3: {
          ...config?.layers?.layer3,
          dbPath: `${workspacePath}/.ontology/ontology.db`
        }
      }
    };
    
    return AnalyzerFactory.createAnalyzer(workspaceConfig);
  }
  
  /**
   * Create a lightweight analyzer for testing
   */
  static async createTestAnalyzer(): Promise<{
    analyzer: CodeAnalyzer;
    layerManager: LayerManager;
    sharedServices: SharedServices;
  }> {
    const testConfig: Partial<CoreConfig> = {
      layers: {
        layer1: { enabled: true, timeout: 10, maxResults: 10, fileTypes: ['ts', 'js'], optimization: { bloomFilter: false, frequencyCache: false, negativeLookup: false } },
        layer2: { enabled: false, timeout: 100, languages: ['typescript'], maxFileSize: 1024, parseTimeout: 50 },
        layer3: { enabled: true, dbPath: ':memory:', cacheSize: 100, conceptThreshold: 0.5, relationshipDepth: 1 },
        layer4: { enabled: true, learningThreshold: 1, confidenceThreshold: 0.5, maxPatterns: 100, decayRate: 0.9 },
        layer5: { enabled: false, maxDepth: 1, autoApplyThreshold: 0.9, propagationTimeout: 20 }
      },
      cache: {
        enabled: true,
        strategy: 'memory',
        memory: {
          maxSize: 1024 * 1024, // 1MB
          ttl: 60 // 1 minute
        }
      },
      monitoring: {
        enabled: false,
        metricsInterval: 10000,
        logLevel: 'error',
        tracing: {
          enabled: false,
          sampleRate: 0
        }
      }
    };
    
    return AnalyzerFactory.createAnalyzer(testConfig);
  }
}

/**
 * Export layer adapters for direct access if needed
 */
export {
  Layer1Adapter,
  Layer2Adapter,
  Layer3Adapter,
  Layer4Adapter,
  Layer5Adapter
};
