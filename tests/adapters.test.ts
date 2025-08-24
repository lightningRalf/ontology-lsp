/**
 * Adapter Integration Tests
 * 
 * Tests all protocol adapters (LSP, MCP, HTTP, CLI) to ensure they correctly
 * convert between their protocol formats and the unified core, while maintaining
 * backward compatibility and consistent behavior.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { CodeAnalyzer } from "../src/core/unified-analyzer.js";
import { LayerManager } from "../src/core/layer-manager.js";
import { SharedServices } from "../src/core/services/index.js";
import { LSPAdapter } from "../src/adapters/lsp-adapter.js";
import { MCPAdapter } from "../src/adapters/mcp-adapter.js";
import { HTTPAdapter } from "../src/adapters/http-adapter.js";
import { CLIAdapter } from "../src/adapters/cli-adapter.js";
import {
  CoreConfig,
  EventBus,
  FindDefinitionRequest,
  FindReferencesRequest,
  RenameRequest,
  CompletionRequest
} from "../src/core/types.js";

// Test fixtures
interface AdapterTestContext {
  codeAnalyzer: CodeAnalyzer;
  layerManager: LayerManager;
  sharedServices: SharedServices;
  eventBus: EventBus;
  config: CoreConfig;
  adapters: {
    lsp: LSPAdapter;
    mcp: MCPAdapter;
    http: HTTPAdapter;
    cli: CLIAdapter;
  };
}

const createAdapterTestContext = async (): Promise<AdapterTestContext> => {
  // Create event bus
  const eventBus: EventBus = {
    emit: () => {},
    on: () => {},
    off: () => {}
  };

  // Create configuration
  const config: CoreConfig = {
    workspaceRoot: "/test-workspace",
    layers: {
      layer1: { enabled: true, timeout: 50 },
      layer2: { enabled: true, timeout: 100 },
      layer3: { enabled: true, timeout: 50 },
      layer4: { enabled: true, timeout: 50 },
      layer5: { enabled: true, timeout: 100 }
    },
    cache: {
      enabled: true,
      defaultTtl: 300,
      maxSize: 1000
    },
    database: {
      path: ":memory:",
      maxConnections: 10
    },
    performance: {
      targetResponseTime: 100,
      maxConcurrentRequests: 50
    }
  };

  // Initialize services and core
  const sharedServices = new SharedServices(config);
  await sharedServices.initialize();

  const layerManager = new LayerManager(config, sharedServices);
  await layerManager.initialize();

  const codeAnalyzer = new CodeAnalyzer(
    layerManager,
    sharedServices,
    config,
    eventBus
  );
  await codeAnalyzer.initialize();

  // Initialize all adapters
  const lspAdapter = new LSPAdapter(codeAnalyzer, {
    serverInfo: {
      name: "ontology-lsp-test",
      version: "1.0.0-test"
    },
    capabilities: {
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      completionProvider: {}
    }
  });

  const mcpAdapter = new MCPAdapter(codeAnalyzer, {
    serverName: "ontology-lsp-mcp-test",
    version: "1.0.0-test",
    tools: {
      searchFiles: true,
      grepContent: true,
      findDefinition: true,
      findReferences: true,
      analyzeComplexity: true,
      detectPatterns: true,
      suggestRefactoring: true
    }
  });

  const httpAdapter = new HTTPAdapter(codeAnalyzer, {
    port: 7010, // Test port
    host: "localhost",
    cors: {
      enabled: true,
      origins: ["*"]
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    }
  });

  const cliAdapter = new CLIAdapter(codeAnalyzer, {
    appName: "ontology-lsp-test",
    version: "1.0.0-test"
  });

  // Initialize adapters
  await lspAdapter.initialize();
  await mcpAdapter.initialize();
  await httpAdapter.initialize();
  await cliAdapter.initialize();

  return {
    codeAnalyzer,
    layerManager,
    sharedServices,
    eventBus,
    config,
    adapters: {
      lsp: lspAdapter,
      mcp: mcpAdapter,
      http: httpAdapter,
      cli: cliAdapter
    }
  };
};

// Test data
const testFile = "file:///test/example.ts";
const testPosition = { line: 10, character: 5 };
const testSymbol = "TestFunction";

describe("Protocol Adapters Integration", () => {
  let context: AdapterTestContext;

  beforeAll(async () => {
    context = await createAdapterTestContext();
  });

  afterAll(async () => {
    await context.adapters.lsp.dispose();
    await context.adapters.mcp.dispose();
    await context.adapters.http.dispose();
    await context.adapters.cli.dispose();
    await context.codeAnalyzer.dispose();
    await context.layerManager.dispose();
    await context.sharedServices.dispose();
  });

  describe("LSP Adapter", () => {
    test("should convert LSP definition requests correctly", async () => {
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition
      };

      // Test the adapter's conversion and execution
      const result = await context.adapters.lsp.handleDefinition(lspRequest);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // LSP should return Location[] format
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('uri');
        expect(result[0]).toHaveProperty('range');
        expect(result[0].range).toHaveProperty('start');
        expect(result[0].range).toHaveProperty('end');
      }
    });

    test("should convert LSP references requests correctly", async () => {
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition,
        context: { includeDeclaration: true }
      };

      const result = await context.adapters.lsp.handleReferences(lspRequest);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // LSP references return Location[] format
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('uri');
        expect(result[0]).toHaveProperty('range');
      }
    });

    test("should handle LSP rename requests correctly", async () => {
      // First prepare rename
      const prepareRequest = {
        textDocument: { uri: testFile },
        position: testPosition
      };

      const prepareResult = await context.adapters.lsp.handlePrepareRename(prepareRequest);
      
      if (prepareResult) {
        expect(prepareResult).toHaveProperty('range');
        expect(prepareResult).toHaveProperty('placeholder');

        // Then execute rename
        const renameRequest = {
          textDocument: { uri: testFile },
          position: testPosition,
          newName: "RenamedFunction"
        };

        const renameResult = await context.adapters.lsp.handleRename(renameRequest);
        expect(renameResult).toBeDefined();
        expect(renameResult).toHaveProperty('changes');
      }
    });

    test("should provide LSP completions correctly", async () => {
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition,
        context: { triggerKind: 1 } // Invoked
      };

      const result = await context.adapters.lsp.handleCompletion(lspRequest);

      expect(result).toBeDefined();
      
      if (Array.isArray(result)) {
        // CompletionItem[] format
        if (result.length > 0) {
          expect(result[0]).toHaveProperty('label');
          expect(typeof result[0].label).toBe('string');
        }
      } else if (result) {
        // CompletionList format
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
      }
    });

    test("should maintain LSP protocol compliance", async () => {
      // Test server capabilities
      const capabilities = context.adapters.lsp.getCapabilities();
      
      expect(capabilities.definitionProvider).toBe(true);
      expect(capabilities.referencesProvider).toBe(true);
      expect(capabilities.renameProvider).toBeTruthy();
      expect(capabilities.completionProvider).toBeDefined();
    });
  });

  describe("MCP Adapter", () => {
    test("should handle search_files tool correctly", async () => {
      const mcpRequest = {
        name: "search_files",
        arguments: {
          pattern: "*.ts",
          content: testSymbol
        }
      };

      const result = await context.adapters.mcp.executeTool(mcpRequest);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
    });

    test("should handle find_definition tool correctly", async () => {
      const mcpRequest = {
        name: "find_definition",
        arguments: {
          symbol: testSymbol,
          file: testFile,
          position: testPosition
        }
      };

      const result = await context.adapters.mcp.executeTool(mcpRequest);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      
      if (result.content.length > 0) {
        expect(result.content[0]).toHaveProperty('uri');
        expect(result.content[0]).toHaveProperty('range');
        expect(result.content[0]).toHaveProperty('confidence');
      }
    });

    test("should handle find_references tool correctly", async () => {
      const mcpRequest = {
        name: "find_references",
        arguments: {
          symbol: testSymbol,
          includeDeclaration: true,
          scope: "workspace"
        }
      };

      const result = await context.adapters.mcp.executeTool(mcpRequest);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
    });

    test("should handle analyze_complexity tool correctly", async () => {
      const mcpRequest = {
        name: "analyze_complexity",
        arguments: {
          file: testFile,
          metrics: ["cyclomatic", "cognitive"]
        }
      };

      const result = await context.adapters.mcp.executeTool(mcpRequest);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveProperty('complexity');
    });

    test("should handle suggest_refactoring tool correctly", async () => {
      const mcpRequest = {
        name: "suggest_refactoring",
        arguments: {
          file: testFile,
          types: ["extract", "simplify"]
        }
      };

      const result = await context.adapters.mcp.executeTool(mcpRequest);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveProperty('suggestions');
    });

    test("should provide correct MCP tool list", async () => {
      const tools = await context.adapters.mcp.listTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain("search_files");
      expect(toolNames).toContain("find_definition");
      expect(toolNames).toContain("find_references");
      expect(toolNames).toContain("analyze_complexity");
      expect(toolNames).toContain("suggest_refactoring");
    });

    test("should handle invalid MCP tool requests gracefully", async () => {
      const invalidRequest = {
        name: "non_existent_tool",
        arguments: {}
      };

      await expect(
        context.adapters.mcp.executeTool(invalidRequest)
      ).rejects.toThrow("Unknown tool");
    });
  });

  describe("HTTP Adapter", () => {
    test("should handle POST /api/definition requests correctly", async () => {
      const httpRequest = {
        method: "POST",
        url: "/api/definition",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: testSymbol,
          uri: testFile,
          position: testPosition,
          includeDeclaration: true
        })
      };

      const response = await context.adapters.http.handleRequest(httpRequest);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");

      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('data');
      expect(responseBody).toHaveProperty('performance');
      expect(responseBody).toHaveProperty('requestId');
      expect(Array.isArray(responseBody.data)).toBe(true);
    });

    test("should handle GET /api/references requests correctly", async () => {
      const httpRequest = {
        method: "GET",
        url: `/api/references?identifier=${testSymbol}&uri=${encodeURIComponent(testFile)}&includeDeclaration=true`,
        headers: {}
      };

      const response = await context.adapters.http.handleRequest(httpRequest);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('data');
      expect(Array.isArray(responseBody.data)).toBe(true);
    });

    test("should handle POST /api/rename requests correctly", async () => {
      const httpRequest = {
        method: "POST",
        url: "/api/rename",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: testSymbol,
          newName: "RenamedFunction",
          uri: testFile,
          position: testPosition,
          dryRun: true
        })
      };

      const response = await context.adapters.http.handleRequest(httpRequest);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('data');
      expect(responseBody.data).toHaveProperty('changes');
    });

    test("should handle GET /api/completions requests correctly", async () => {
      const httpRequest = {
        method: "GET",
        url: `/api/completions?uri=${encodeURIComponent(testFile)}&line=${testPosition.line}&character=${testPosition.character}`,
        headers: {}
      };

      const response = await context.adapters.http.handleRequest(httpRequest);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('data');
      expect(Array.isArray(responseBody.data)).toBe(true);
    });

    test("should provide health check endpoint", async () => {
      const httpRequest = {
        method: "GET",
        url: "/health",
        headers: {}
      };

      const response = await context.adapters.http.handleRequest(httpRequest);

      expect(response.status).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('status');
      expect(responseBody.status).toBe('healthy');
    });

    test("should handle CORS requests correctly", async () => {
      const corsRequest = {
        method: "OPTIONS",
        url: "/api/definition",
        headers: {
          "origin": "https://example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      };

      const response = await context.adapters.http.handleRequest(corsRequest);

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"]).toContain("content-type");
    });

    test("should handle HTTP errors gracefully", async () => {
      const invalidRequest = {
        method: "POST",
        url: "/api/definition",
        headers: { "content-type": "application/json" },
        body: "invalid json"
      };

      const response = await context.adapters.http.handleRequest(invalidRequest);

      expect(response.status).toBe(400);
      const responseBody = JSON.parse(response.body);
      expect(responseBody).toHaveProperty('error');
    });
  });

  describe("CLI Adapter", () => {
    test("should handle 'find' command correctly", async () => {
      const cliArgs = ["find", testSymbol, "--file", testFile];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      
      if (result.data && Array.isArray(result.data)) {
        // Should return definitions
        result.data.forEach((def: any) => {
          expect(def).toHaveProperty('uri');
          expect(def).toHaveProperty('range');
        });
      }
    });

    test("should handle 'references' command correctly", async () => {
      const cliArgs = ["references", testSymbol, "--include-declaration"];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      
      if (result.data && Array.isArray(result.data)) {
        // Should return references
        result.data.forEach((ref: any) => {
          expect(ref).toHaveProperty('uri');
          expect(ref).toHaveProperty('range');
        });
      }
    });

    test("should handle 'analyze' command correctly", async () => {
      const cliArgs = ["analyze", testFile, "--metrics", "complexity"];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toContain("analysis");
    });

    test("should handle 'suggest' command correctly", async () => {
      const cliArgs = ["suggest", testFile, "--type", "refactoring"];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test("should provide help information", async () => {
      const cliArgs = ["--help"];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toContain("ontology-lsp-test");
      expect(result.output).toContain("find");
      expect(result.output).toContain("references");
      expect(result.output).toContain("analyze");
      expect(result.output).toContain("suggest");
    });

    test("should handle invalid CLI commands gracefully", async () => {
      const cliArgs = ["invalid-command"];

      const result = await context.adapters.cli.executeCommand(cliArgs);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Cross-Adapter Consistency", () => {
    test("should return equivalent results across all adapters for definition", async () => {
      const coreRequest: FindDefinitionRequest = {
        identifier: testSymbol,
        uri: testFile,
        position: testPosition,
        includeDeclaration: true
      };

      // Get result from core analyzer
      const coreResult = await context.codeAnalyzer.findDefinition(coreRequest);

      // Test LSP adapter
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition
      };
      const lspResult = await context.adapters.lsp.handleDefinition(lspRequest);

      // Test MCP adapter
      const mcpRequest = {
        name: "find_definition",
        arguments: {
          symbol: testSymbol,
          file: testFile,
          position: testPosition
        }
      };
      const mcpResult = await context.adapters.mcp.executeTool(mcpRequest);

      // Test HTTP adapter
      const httpRequest = {
        method: "POST",
        url: "/api/definition",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(coreRequest)
      };
      const httpResponse = await context.adapters.http.handleRequest(httpRequest);
      const httpResult = JSON.parse(httpResponse.body);

      // Test CLI adapter
      const cliResult = await context.adapters.cli.executeCommand([
        "find", testSymbol, "--file", testFile
      ]);

      // All adapters should return data (even if empty)
      expect(coreResult.data).toBeDefined();
      expect(lspResult).toBeDefined();
      expect(mcpResult.content).toBeDefined();
      expect(httpResult.data).toBeDefined();
      expect(cliResult.success).toBe(true);

      // Results should be consistent in structure
      if (coreResult.data.length > 0) {
        expect(Array.isArray(lspResult)).toBe(true);
        expect(Array.isArray(mcpResult.content)).toBe(true);
        expect(Array.isArray(httpResult.data)).toBe(true);
      }
    });

    test("should handle errors consistently across adapters", async () => {
      const invalidSymbol = "";

      // Test how each adapter handles invalid input
      
      // LSP adapter
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition
      };
      
      // Should not throw but return empty results or handle gracefully
      const lspResult = await context.adapters.lsp.handleDefinition(lspRequest);
      expect(lspResult).toBeDefined();

      // MCP adapter
      const mcpRequest = {
        name: "find_definition",
        arguments: {
          symbol: invalidSymbol,
          file: testFile
        }
      };

      // Should handle gracefully
      const mcpResult = await context.adapters.mcp.executeTool(mcpRequest);
      expect(mcpResult).toBeDefined();

      // HTTP adapter
      const httpRequest = {
        method: "POST",
        url: "/api/definition",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: invalidSymbol,
          uri: testFile,
          position: testPosition
        })
      };

      const httpResponse = await context.adapters.http.handleRequest(httpRequest);
      // Should return a proper error response or empty result
      expect(httpResponse.status).toBeOneOf([200, 400]);

      // CLI adapter
      const cliResult = await context.adapters.cli.executeCommand([
        "find", invalidSymbol, "--file", testFile
      ]);
      expect(cliResult).toBeDefined();
      // CLI might succeed with empty results or fail gracefully
      expect(typeof cliResult.success).toBe("boolean");
    });
  });

  describe("Backward Compatibility", () => {
    test("should maintain compatibility with existing LSP clients", async () => {
      // Test that standard LSP methods are available and working
      const capabilities = context.adapters.lsp.getCapabilities();
      
      expect(capabilities).toHaveProperty('definitionProvider');
      expect(capabilities).toHaveProperty('referencesProvider');
      expect(capabilities).toHaveProperty('renameProvider');
      expect(capabilities).toHaveProperty('completionProvider');

      // Test standard LSP request/response format
      const lspRequest = {
        textDocument: { uri: testFile },
        position: testPosition
      };

      const result = await context.adapters.lsp.handleDefinition(lspRequest);
      
      // Should return LSP-compliant Location[] or LocationLink[]
      expect(Array.isArray(result)).toBe(true);
    });

    test("should maintain compatibility with existing MCP tools", async () => {
      const tools = await context.adapters.mcp.listTools();
      
      // Should have all expected MCP tools
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain("search_files");
      expect(toolNames).toContain("find_definition");
      expect(toolNames).toContain("find_references");

      // Each tool should have proper schema
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });
    });

    test("should maintain compatibility with existing HTTP API clients", async () => {
      // Test that existing REST endpoints still work
      const endpoints = [
        "/api/definition",
        "/api/references", 
        "/api/completions",
        "/health"
      ];

      for (const endpoint of endpoints) {
        const httpRequest = {
          method: endpoint === "/health" ? "GET" : "POST",
          url: endpoint,
          headers: { "content-type": "application/json" },
          body: endpoint !== "/health" ? JSON.stringify({
            identifier: testSymbol,
            uri: testFile,
            position: testPosition
          }) : undefined
        };

        const response = await context.adapters.http.handleRequest(httpRequest);
        
        // Should return a valid HTTP response
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(500);
        expect(response.headers["content-type"]).toContain("application/json");
      }
    });

    test("should maintain compatibility with existing CLI usage", async () => {
      // Test that existing CLI commands still work
      const commands = [
        ["--help"],
        ["find", testSymbol],
        ["references", testSymbol],
        ["analyze", testFile]
      ];

      for (const command of commands) {
        const result = await context.adapters.cli.executeCommand(command);
        
        expect(result).toBeDefined();
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('output');
        
        // Help should always succeed
        if (command[0] === "--help") {
          expect(result.success).toBe(true);
        }
      }
    });
  });

  describe("Performance Across Adapters", () => {
    test("should meet performance targets across all adapters", async () => {
      const performanceTests = [
        {
          name: "LSP Definition",
          test: async () => {
            const start = Date.now();
            await context.adapters.lsp.handleDefinition({
              textDocument: { uri: testFile },
              position: testPosition
            });
            return Date.now() - start;
          }
        },
        {
          name: "MCP Find Definition",
          test: async () => {
            const start = Date.now();
            await context.adapters.mcp.executeTool({
              name: "find_definition",
              arguments: { symbol: testSymbol, file: testFile }
            });
            return Date.now() - start;
          }
        },
        {
          name: "HTTP Definition",
          test: async () => {
            const start = Date.now();
            await context.adapters.http.handleRequest({
              method: "POST",
              url: "/api/definition",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                identifier: testSymbol,
                uri: testFile,
                position: testPosition
              })
            });
            return Date.now() - start;
          }
        },
        {
          name: "CLI Find",
          test: async () => {
            const start = Date.now();
            await context.adapters.cli.executeCommand(["find", testSymbol]);
            return Date.now() - start;
          }
        }
      ];

      for (const { name, test } of performanceTests) {
        const duration = await test();
        
        // All adapters should complete within reasonable time
        // (including adapter overhead on top of core performance)
        expect(duration).toBeLessThan(150); // Allow extra time for adapter layer
        console.log(`${name}: ${duration}ms`);
      }
    });
  });
});