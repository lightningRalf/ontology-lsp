/**
 * Test Helper Utilities
 * 
 * Provides utilities for proper path handling and configuration in tests
 * Works consistently across different environments and working directories
 */

import * as path from 'path'
import * as fs from 'fs'

/**
 * Get the absolute path to the project root directory
 * This works regardless of where tests are run from
 */
export function getProjectRoot(): string {
  let currentDir = __dirname
  
  // Walk up the directory tree until we find package.json
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
  }
  
  // Fallback to current working directory if not found
  return process.cwd()
}

/**
 * Get paths relative to project root
 */
export function getProjectPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments)
}

/**
 * Get paths for common test directories
 */
export const testPaths = {
  // Main directories
  root: () => getProjectRoot(),
  src: () => getProjectPath('src'),
  tests: () => getProjectPath('tests'),
  dist: () => getProjectPath('dist'),
  
  // Test-specific paths
  fixtures: () => getProjectPath('tests', 'fixtures'),
  testWorkspace: () => getProjectPath('.test-workspace'),
  
  // Server executables
  serverJs: () => getProjectPath('dist', 'server.js'),
  serverNew: () => getProjectPath('src', 'server-new.ts'),
  
  // Config files
  packageJson: () => getProjectPath('package.json'),
  tsConfig: () => getProjectPath('tsconfig.json'),
  
  // Test databases (in-memory or temp)
  testDb: (name?: string) => name ? getProjectPath('.test-data', `${name}.db`) : ':memory:',
}

/**
 * Ensure test directories exist
 */
export function ensureTestDirectories(): void {
  const dirs = [
    testPaths.fixtures(),
    testPaths.testWorkspace(),
    path.dirname(testPaths.testDb('dummy')), // Creates .test-data directory
  ]
  
  for (const dir of dirs) {
    if (dir !== ':memory:' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

/**
 * Clean up test directories
 */
export function cleanupTestDirectories(): void {
  const dirs = [
    testPaths.testWorkspace(),
    path.dirname(testPaths.testDb('dummy')), // .test-data directory
  ]
  
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

/**
 * Create test configuration with proper paths
 */
export function createTestConfig(overrides: any = {}) {
  return {
    workspaceRoot: testPaths.testWorkspace(),
    layers: {
      layer1: { enabled: true, timeout: 50 },
      layer2: { enabled: true, timeout: 100 },
      layer3: { enabled: true, timeout: 50 },
      layer4: { enabled: true, timeout: 50 },
      layer5: { enabled: true, timeout: 100 }
    },
    cache: {
      enabled: true,
      strategy: 'memory' as const,
      memory: {
        maxSize: 1024 * 1024, // 1MB
        ttl: 300
      }
    },
    database: {
      path: testPaths.testDb(),
      maxConnections: 10
    },
    performance: {
      targetResponseTime: 100,
      maxConcurrentRequests: 50,
      healthCheckInterval: 30000
    },
    monitoring: {
      enabled: false,
      metricsInterval: 60000,
      logLevel: 'error' as const,
      tracing: {
        enabled: false,
        sampleRate: 0
      }
    },
    ...overrides
  }
}

/**
 * File URI utilities for tests
 */
export function toFileUri(filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : getProjectPath(filePath)
  return `file://${absolutePath.replace(/\\/g, '/')}`
}

export function fromFileUri(uri: string): string {
  if (!uri.startsWith('file://')) {
    return uri
  }
  return uri.substring(7).replace(/\//g, path.sep)
}

/**
 * Wait for a condition to be true (useful for async tests)
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    
    const check = async () => {
      try {
        const result = await condition()
        if (result) {
          resolve()
          return
        }
      } catch (error) {
        // Continue checking unless timeout reached
      }
      
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Condition not met within ${timeoutMs}ms`))
        return
      }
      
      setTimeout(check, intervalMs)
    }
    
    check()
  })
}

/**
 * Create a simple test file for testing
 */
export function createTestFile(relativePath: string, content: string): string {
  const fullPath = getProjectPath(relativePath)
  const dir = path.dirname(fullPath)
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  fs.writeFileSync(fullPath, content, 'utf8')
  return fullPath
}

/**
 * Default test file content for various languages
 */
export const testFileContents = {
  typescript: `
export class TestClass {
  private value: number = 0;
  
  constructor(initialValue?: number) {
    this.value = initialValue ?? 0;
  }
  
  public getValue(): number {
    return this.value;
  }
  
  public setValue(newValue: number): void {
    this.value = newValue;
  }
  
  public static createDefault(): TestClass {
    return new TestClass(42);
  }
}

export function TestFunction(param: string): string {
  return \`Hello, \${param}!\`;
}

export interface TestInterface {
  id: string;
  name: string;
  active: boolean;
}
  `.trim(),
  
  javascript: `
class TestClass {
  constructor(initialValue = 0) {
    this.value = initialValue;
  }
  
  getValue() {
    return this.value;
  }
  
  setValue(newValue) {
    this.value = newValue;
  }
  
  static createDefault() {
    return new TestClass(42);
  }
}

function TestFunction(param) {
  return \`Hello, \${param}!\`;
}

module.exports = { TestClass, TestFunction };
  `.trim(),
}

/**
 * Environment detection
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test'
}

export function isBunRuntime(): boolean {
  return typeof Bun !== 'undefined'
}