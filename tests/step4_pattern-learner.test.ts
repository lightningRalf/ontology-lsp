import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PatternLearner } from '../src/patterns/pattern-learner';
import { RenameContext } from '../src/types/core';

describe('Step 4: PatternLearner', () => {
  let learner: PatternLearner;
  const context: RenameContext = { file: 'file.ts', surroundingSymbols: [], timestamp: new Date() };

  beforeAll(async () => {
    learner = new PatternLearner(':memory:', { learningThreshold: 2 });
    await new Promise(res => setTimeout(res, 50));
  });

  afterAll(async () => {
    await (learner as any).storage?.close?.();
  });

  test('promotes candidate to pattern after threshold', async () => {
    await learner.learnFromRename('getUser', 'fetchUser', context);
    const result = await learner.learnFromRename('getData', 'fetchData', context);
    expect(result.pattern).toBeDefined();
    const patterns = (learner as any).patterns;
    expect(patterns.size).toBeGreaterThan(0);
  });

  test('strengthens existing pattern on further examples', async () => {
    const things = (learner as any).patterns;
    const existing = things.values().next().value;
    const prevOccurrences = existing.occurrences;
    await learner.learnFromRename('getItem', 'fetchItem', context);
    const updated = things.get(existing.id);
    expect(updated.occurrences).toBeGreaterThanOrEqual(prevOccurrences);
    expect(updated.confidence).toBeGreaterThanOrEqual(existing.confidence);
  });
});