import { describe, expect, test } from "bun:test";
import { AsyncEnhancedGrep } from "../src/layers/enhanced-search-tools-async";

describe("AsyncEnhancedGrep cancellable operations", () => {
  test("searchCancellable can be cancelled quickly", async () => {
    const grep = new AsyncEnhancedGrep();
    const ctrl = grep.searchCancellable({
      pattern: "CodeAnalyzer",
      path: process.cwd(),
      timeout: 5000,
      maxResults: 1000,
      caseInsensitive: true,
    });
    const start = Date.now();
    setTimeout(() => ctrl.cancel(), 50);
    const results = await ctrl.promise;
    const elapsed = Date.now() - start;
    // Expect cancellation to happen well under a second
    expect(elapsed).toBeLessThan(1000);
    // Results may be partial or empty; ensure promise resolved
    expect(Array.isArray(results)).toBe(true);
  });

  test("listFilesCancellable can be cancelled quickly", async () => {
    const grep = new AsyncEnhancedGrep();
    const ctrl = grep.listFilesCancellable({
      includes: ["**/*CodeAnalyzer*.{ts,tsx,js,jsx,md}"] ,
      excludes: ["node_modules","dist",".git","coverage"],
      path: process.cwd(),
      maxDepth: 8,
      timeout: 5000,
      maxFiles: 5000,
    });
    const start = Date.now();
    setTimeout(() => ctrl.cancel(), 50);
    const files = await ctrl.promise;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(Array.isArray(files)).toBe(true);
  });
});

