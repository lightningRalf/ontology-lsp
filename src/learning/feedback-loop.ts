/**
 * FeedbackLoopSystem - Tracks accepted/rejected suggestions and learns from user corrections
 * This system implements the continuous learning loop from user interactions
 */

import { EventBus, CoreError } from '../core/types.js';
import { SharedServices } from '../core/services/index.js';
import { Pattern, Suggestion, PatternCategory } from '../types/core.js';
import { PatternLearner } from '../patterns/pattern-learner.js';
import { v4 as uuidv4 } from 'uuid';

export interface FeedbackEvent {
  id: string;
  type: 'accept' | 'reject' | 'modify' | 'ignore';
  suggestionId: string;
  patternId?: string;
  originalSuggestion: string;
  finalValue?: string; // What the user actually used
  context: {
    file: string;
    operation: string; // 'rename', 'refactor', 'completion', etc.
    timestamp: Date;
    userId?: string;
    confidence: number;
  };
  metadata: {
    timeToDecision?: number; // milliseconds from suggestion to decision
    keystrokes?: number; // if user modified the suggestion
    alternativesShown?: number;
    source: 'vscode' | 'claude' | 'cli' | 'web';
  };
}

export interface FeedbackStats {
  totalFeedbacks: number;
  acceptanceRate: number;
  rejectionRate: number;
  modificationRate: number;
  averageConfidence: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  patternPerformance: Array<{ patternId: string; acceptanceRate: number; usageCount: number }>;
  recentTrends: {
    last24h: { accepted: number; rejected: number; modified: number };
    last7d: { accepted: number; rejected: number; modified: number };
    last30d: { accepted: number; rejected: number; modified: number };
  };
}

export interface LearningInsight {
  type: 'pattern_weakness' | 'pattern_strength' | 'new_trend' | 'user_preference';
  description: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  evidence: string[];
  discoveredAt: Date;
}

export class FeedbackLoopSystem {
  private sharedServices: SharedServices;
  private eventBus: EventBus;
  private patternLearner: PatternLearner | null = null;
  private initialized = false;
  private feedbackHistory: Map<string, FeedbackEvent> = new Map();
  private learningThresholds = {
    minFeedbacksToLearn: 5,
    weakPatternThreshold: 0.3, // Below 30% acceptance rate
    strongPatternThreshold: 0.8, // Above 80% acceptance rate
    modificationSimilarityThreshold: 0.7 // How similar modification needs to be to original
  };

  // Performance target: <20ms for learning operations
  private performanceTargets = {
    recordFeedback: 10, // ms
    updatePatternStrength: 15, // ms
    generateInsights: 20, // ms
  };

  constructor(
    sharedServices: SharedServices, 
    eventBus: EventBus,
    config?: {
      minFeedbacksToLearn?: number;
      weakPatternThreshold?: number;
      strongPatternThreshold?: number;
    }
  ) {
    this.sharedServices = sharedServices;
    this.eventBus = eventBus;
    
    if (config) {
      this.learningThresholds = { ...this.learningThresholds, ...config };
    }

    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.initializeDatabaseSchema();
      await this.loadFeedbackHistory();
      
      this.initialized = true;
      
      this.eventBus.emit('feedback-loop:initialized', {
        timestamp: Date.now(),
        historySize: this.feedbackHistory.size
      });
      
    } catch (error) {
      throw new CoreError(
        `FeedbackLoopSystem initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        'FEEDBACK_INIT_ERROR'
      );
    }
  }

  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.feedbackHistory.clear();
    this.initialized = false;
    
    this.eventBus.emit('feedback-loop:disposed', {
      timestamp: Date.now()
    });
  }

  /**
   * Record user feedback on a suggestion
   * Target: <10ms performance
   */
  async recordFeedback(feedback: Omit<FeedbackEvent, 'id'>): Promise<string> {
    const startTime = Date.now();
    
    if (!this.initialized) {
      throw new CoreError('FeedbackLoopSystem not initialized', 'NOT_INITIALIZED');
    }

    try {
      const feedbackId = uuidv4();
      const fullFeedback: FeedbackEvent = {
        id: feedbackId,
        ...feedback
      };

      // Store in memory for quick access
      this.feedbackHistory.set(feedbackId, fullFeedback);

      // Persist to database
      await this.storeFeedbackToDatabase(fullFeedback);

      // Update pattern confidence immediately for real-time learning
      if (feedback.patternId) {
        await this.updatePatternConfidence(feedback.patternId, feedback.type, feedback.context.confidence);
      }

      // Emit event for other systems
      this.eventBus.emit('feedback-recorded', {
        feedbackId,
        type: feedback.type,
        patternId: feedback.patternId,
        timestamp: Date.now()
      });

      const duration = Date.now() - startTime;
      if (duration > this.performanceTargets.recordFeedback) {
        console.warn(`FeedbackLoopSystem.recordFeedback took ${duration}ms (target: ${this.performanceTargets.recordFeedback}ms)`);
      }

      return feedbackId;
      
    } catch (error) {
      this.eventBus.emit('feedback-loop:error', {
        operation: 'recordFeedback',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Learn from user corrections - when user modifies a suggestion
   * Target: <15ms performance 
   */
  async learnFromCorrection(
    originalSuggestion: string,
    userCorrection: string,
    context: {
      file: string;
      operation: string;
      patternId?: string;
      confidence: number;
    }
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Calculate similarity between original and correction
      const similarity = this.calculateSimilarity(originalSuggestion, userCorrection);
      
      if (similarity >= this.learningThresholds.modificationSimilarityThreshold) {
        // User made minor modification - strengthen pattern with adjustment
        if (context.patternId && this.patternLearner) {
          await this.refinePattern(context.patternId, originalSuggestion, userCorrection, context);
        }
      } else {
        // User made major change - this might indicate a new pattern
        if (this.patternLearner) {
          await this.patternLearner.learnFromRename(originalSuggestion, userCorrection, {
            file: context.file,
            surroundingSymbols: [], // Would be populated from real context
            timestamp: new Date()
          });
        }
      }

      // Record the correction as feedback
      await this.recordFeedback({
        type: 'modify',
        suggestionId: uuidv4(), // Would be passed from calling code
        patternId: context.patternId,
        originalSuggestion,
        finalValue: userCorrection,
        context: {
          file: context.file,
          operation: context.operation,
          timestamp: new Date(),
          confidence: context.confidence
        },
        metadata: {
          source: 'vscode', // Would be detected from calling context
          keystrokes: Math.abs(userCorrection.length - originalSuggestion.length)
        }
      });

      const duration = Date.now() - startTime;
      if (duration > this.performanceTargets.updatePatternStrength) {
        console.warn(`FeedbackLoopSystem.learnFromCorrection took ${duration}ms (target: ${this.performanceTargets.updatePatternStrength}ms)`);
      }

    } catch (error) {
      console.error('Failed to learn from correction:', error);
      throw error;
    }
  }

  /**
   * Set pattern learner reference for integration
   */
  setPatternLearner(patternLearner: PatternLearner): void {
    this.patternLearner = patternLearner;
  }

  /**
   * Get feedback statistics and performance metrics
   */
  async getFeedbackStats(timeRange?: { from: Date; to: Date }): Promise<FeedbackStats> {
    const feedbacks = timeRange 
      ? Array.from(this.feedbackHistory.values()).filter(f => 
          f.context.timestamp >= timeRange.from && f.context.timestamp <= timeRange.to)
      : Array.from(this.feedbackHistory.values());

    if (feedbacks.length === 0) {
      return this.getEmptyStats();
    }

    const totalFeedbacks = feedbacks.length;
    const accepted = feedbacks.filter(f => f.type === 'accept').length;
    const rejected = feedbacks.filter(f => f.type === 'reject').length;
    const modified = feedbacks.filter(f => f.type === 'modify').length;

    // Pattern performance analysis
    const patternPerformance = new Map<string, { accepted: number; total: number }>();
    for (const feedback of feedbacks) {
      if (feedback.patternId) {
        const stats = patternPerformance.get(feedback.patternId) || { accepted: 0, total: 0 };
        stats.total++;
        if (feedback.type === 'accept') {
          stats.accepted++;
        }
        patternPerformance.set(feedback.patternId, stats);
      }
    }

    // Time-based trends
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      totalFeedbacks,
      acceptanceRate: accepted / totalFeedbacks,
      rejectionRate: rejected / totalFeedbacks,
      modificationRate: modified / totalFeedbacks,
      averageConfidence: feedbacks.reduce((sum, f) => sum + f.context.confidence, 0) / totalFeedbacks,
      topRejectionReasons: [], // Would be implemented based on rejection categorization
      patternPerformance: Array.from(patternPerformance.entries()).map(([patternId, stats]) => ({
        patternId,
        acceptanceRate: stats.accepted / stats.total,
        usageCount: stats.total
      })),
      recentTrends: {
        last24h: this.getTrendStats(feedbacks, last24h),
        last7d: this.getTrendStats(feedbacks, last7d),
        last30d: this.getTrendStats(feedbacks, last30d)
      }
    };
  }

  /**
   * Generate learning insights based on feedback patterns
   * Target: <20ms performance
   */
  async generateInsights(): Promise<LearningInsight[]> {
    const startTime = Date.now();
    const insights: LearningInsight[] = [];

    try {
      const stats = await this.getFeedbackStats();
      
      // Insight 1: Weak patterns
      for (const pattern of stats.patternPerformance) {
        if (pattern.acceptanceRate < this.learningThresholds.weakPatternThreshold && 
            pattern.usageCount >= this.learningThresholds.minFeedbacksToLearn) {
          insights.push({
            type: 'pattern_weakness',
            description: `Pattern ${pattern.patternId} has low acceptance rate (${(pattern.acceptanceRate * 100).toFixed(1)}%)`,
            confidence: 1 - pattern.acceptanceRate,
            actionable: true,
            suggestedAction: 'Consider reviewing and refining this pattern',
            evidence: [`${pattern.usageCount} usages with ${(pattern.acceptanceRate * 100).toFixed(1)}% acceptance`],
            discoveredAt: new Date()
          });
        }
      }

      // Insight 2: Strong patterns
      for (const pattern of stats.patternPerformance) {
        if (pattern.acceptanceRate > this.learningThresholds.strongPatternThreshold && 
            pattern.usageCount >= this.learningThresholds.minFeedbacksToLearn) {
          insights.push({
            type: 'pattern_strength',
            description: `Pattern ${pattern.patternId} has high acceptance rate (${(pattern.acceptanceRate * 100).toFixed(1)}%)`,
            confidence: pattern.acceptanceRate,
            actionable: true,
            suggestedAction: 'Consider promoting this pattern for wider use',
            evidence: [`${pattern.usageCount} usages with ${(pattern.acceptanceRate * 100).toFixed(1)}% acceptance`],
            discoveredAt: new Date()
          });
        }
      }

      // Insight 3: High modification rate
      if (stats.modificationRate > 0.4) {
        insights.push({
          type: 'user_preference',
          description: `High modification rate (${(stats.modificationRate * 100).toFixed(1)}%) suggests suggestions need refinement`,
          confidence: stats.modificationRate,
          actionable: true,
          suggestedAction: 'Analyze modified suggestions to improve pattern accuracy',
          evidence: [`${Math.round(stats.totalFeedbacks * stats.modificationRate)} modifications out of ${stats.totalFeedbacks} suggestions`],
          discoveredAt: new Date()
        });
      }

      const duration = Date.now() - startTime;
      if (duration > this.performanceTargets.generateInsights) {
        console.warn(`FeedbackLoopSystem.generateInsights took ${duration}ms (target: ${this.performanceTargets.generateInsights}ms)`);
      }

      return insights;
      
    } catch (error) {
      console.error('Failed to generate insights:', error);
      throw error;
    }
  }

  /**
   * Get feedback events for a specific pattern
   */
  getFeedbackForPattern(patternId: string): FeedbackEvent[] {
    return Array.from(this.feedbackHistory.values())
      .filter(feedback => feedback.patternId === patternId)
      .sort((a, b) => b.context.timestamp.getTime() - a.context.timestamp.getTime());
  }

  /**
   * Get recent feedback events
   */
  getRecentFeedback(limit: number = 100): FeedbackEvent[] {
    return Array.from(this.feedbackHistory.values())
      .sort((a, b) => b.context.timestamp.getTime() - a.context.timestamp.getTime())
      .slice(0, limit);
  }

  // Private helper methods

  private setupEventListeners(): void {
    // Listen for pattern application events to potentially record feedback
    this.eventBus.on('pattern:applied', (data: any) => {
      // This would trigger when patterns are used, allowing us to prepare for feedback
      console.log('Pattern applied, ready to receive feedback:', data.patternId);
    });

    // Listen for suggestion events
    this.eventBus.on('suggestion:provided', (data: any) => {
      // Track suggestions provided to users for later feedback correlation
      console.log('Suggestion provided:', data.suggestionId);
    });
  }

  private async initializeDatabaseSchema(): Promise<void> {
    try {
      // Create feedback_events table
      await this.sharedServices.database.execute(`
        CREATE TABLE IF NOT EXISTS feedback_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('accept', 'reject', 'modify', 'ignore')),
          suggestion_id TEXT NOT NULL,
          pattern_id TEXT,
          original_suggestion TEXT NOT NULL,
          final_value TEXT,
          file_path TEXT NOT NULL,
          operation TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          user_id TEXT,
          confidence REAL NOT NULL,
          time_to_decision INTEGER,
          keystrokes INTEGER,
          alternatives_shown INTEGER,
          source TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Create index for efficient queries
      await this.sharedServices.database.execute(`
        CREATE INDEX IF NOT EXISTS idx_feedback_events_timestamp ON feedback_events(timestamp)
      `);

      await this.sharedServices.database.execute(`
        CREATE INDEX IF NOT EXISTS idx_feedback_events_pattern_id ON feedback_events(pattern_id)
      `);

      await this.sharedServices.database.execute(`
        CREATE INDEX IF NOT EXISTS idx_feedback_events_type ON feedback_events(type)
      `);

    } catch (error) {
      throw new CoreError(`Failed to initialize feedback database schema: ${error}`, 'DB_SCHEMA_ERROR');
    }
  }

  private async loadFeedbackHistory(): Promise<void> {
    try {
      const rows = await this.sharedServices.database.query(
        'SELECT * FROM feedback_events ORDER BY timestamp DESC LIMIT 1000'
      );

      for (const row of rows) {
        const feedback: FeedbackEvent = {
          id: row.id,
          type: row.type,
          suggestionId: row.suggestion_id,
          patternId: row.pattern_id,
          originalSuggestion: row.original_suggestion,
          finalValue: row.final_value,
          context: {
            file: row.file_path,
            operation: row.operation,
            timestamp: new Date(row.timestamp * 1000),
            userId: row.user_id,
            confidence: row.confidence
          },
          metadata: {
            timeToDecision: row.time_to_decision,
            keystrokes: row.keystrokes,
            alternativesShown: row.alternatives_shown,
            source: row.source
          }
        };

        this.feedbackHistory.set(feedback.id, feedback);
      }

    } catch (error) {
      console.warn('Failed to load feedback history:', error);
      // Don't throw - system can start with empty history
    }
  }

  private async storeFeedbackToDatabase(feedback: FeedbackEvent): Promise<void> {
    try {
      await this.sharedServices.database.execute(
        `INSERT INTO feedback_events (
          id, type, suggestion_id, pattern_id, original_suggestion, final_value,
          file_path, operation, timestamp, user_id, confidence,
          time_to_decision, keystrokes, alternatives_shown, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          feedback.id,
          feedback.type,
          feedback.suggestionId,
          feedback.patternId,
          feedback.originalSuggestion,
          feedback.finalValue,
          feedback.context.file,
          feedback.context.operation,
          Math.floor(feedback.context.timestamp.getTime() / 1000),
          feedback.context.userId,
          feedback.context.confidence,
          feedback.metadata.timeToDecision,
          feedback.metadata.keystrokes,
          feedback.metadata.alternativesShown,
          feedback.metadata.source
        ]
      );
    } catch (error) {
      console.error('Failed to store feedback to database:', error);
      // Don't throw - we have in-memory backup
    }
  }

  private async updatePatternConfidence(
    patternId: string, 
    feedbackType: string, 
    originalConfidence: number
  ): Promise<void> {
    // This would integrate with PatternLearner to adjust pattern confidence
    // based on user feedback in real-time
    
    if (!this.patternLearner) {
      return;
    }

    const adjustment = this.calculateConfidenceAdjustment(feedbackType, originalConfidence);
    
    this.eventBus.emit('pattern:confidence-update', {
      patternId,
      feedbackType,
      adjustment,
      timestamp: Date.now()
    });
  }

  private calculateConfidenceAdjustment(feedbackType: string, originalConfidence: number): number {
    switch (feedbackType) {
      case 'accept':
        return Math.min(0.1, (1 - originalConfidence) * 0.2); // Increase by up to 0.1
      case 'reject':
        return -Math.min(0.2, originalConfidence * 0.3); // Decrease by up to 0.2  
      case 'modify':
        return -Math.min(0.05, originalConfidence * 0.1); // Small decrease
      case 'ignore':
        return -Math.min(0.02, originalConfidence * 0.05); // Very small decrease
      default:
        return 0;
    }
  }

  private async refinePattern(
    patternId: string,
    original: string, 
    correction: string,
    context: any
  ): Promise<void> {
    // This would work with PatternLearner to refine patterns based on corrections
    if (this.patternLearner) {
      // For now, just emit an event that PatternLearner can listen to
      this.eventBus.emit('pattern:refinement-needed', {
        patternId,
        original,
        correction,
        context,
        timestamp: Date.now()
      });
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private getTrendStats(feedbacks: FeedbackEvent[], fromDate: Date) {
    const filtered = feedbacks.filter(f => f.context.timestamp >= fromDate);
    return {
      accepted: filtered.filter(f => f.type === 'accept').length,
      rejected: filtered.filter(f => f.type === 'reject').length,
      modified: filtered.filter(f => f.type === 'modify').length
    };
  }

  private getEmptyStats(): FeedbackStats {
    return {
      totalFeedbacks: 0,
      acceptanceRate: 0,
      rejectionRate: 0,
      modificationRate: 0,
      averageConfidence: 0,
      topRejectionReasons: [],
      patternPerformance: [],
      recentTrends: {
        last24h: { accepted: 0, rejected: 0, modified: 0 },
        last7d: { accepted: 0, rejected: 0, modified: 0 },
        last30d: { accepted: 0, rejected: 0, modified: 0 }
      }
    };
  }

  /**
   * Get diagnostic information for debugging
   */
  getDiagnostics(): Record<string, any> {
    return {
      initialized: this.initialized,
      feedbackHistorySize: this.feedbackHistory.size,
      learningThresholds: this.learningThresholds,
      performanceTargets: this.performanceTargets,
      hasPatternLearner: !!this.patternLearner,
      timestamp: Date.now()
    };
  }
}