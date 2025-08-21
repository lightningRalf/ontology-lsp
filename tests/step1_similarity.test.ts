import { SimilarityCalculator } from '../src/ontology/similarity-calculator';

describe('Step 1: SimilarityCalculator', () => {
  const calc = new SimilarityCalculator();

  test('identical identifiers have similarity 1', async () => {
    await expect(calc.calculate('getUser', 'getUser')).resolves.toBe(1);
  });

  test('synonym based identifiers show high similarity', async () => {
    const sim = await calc.calculate('getUser', 'fetchUser');
    expect(sim).toBeGreaterThan(0.7);
  });

  test('findMostSimilar returns the closest candidate', () => {
    const most = calc.findMostSimilar('getUser', ['fetchUser', 'setUser']);
    expect(most).toBe('fetchUser');
  });
});