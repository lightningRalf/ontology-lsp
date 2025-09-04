# Claude-MCP Integration Test Report

**Overall Result: 6/7 tests passed**
**Total Duration: 6064ms**
**Server Startup Time: N/A**

## Summary

❌ **1 TESTS FAILED** - Server has compatibility issues

## Detailed Results

### ✅ Claude Initialization Sequence
- **Duration:** 32ms
- **Details:** {
  "serverStartupTime": 1014,
  "initializationTime": 32,
  "toolsFound": 4,
  "expectedTools": 4
}

### ✅ find_definition Tool
- **Duration:** 4354ms
- **Details:** {
  "basicSearchResults": 1,
  "workspaceSearchResults": 1,
  "fuzzySearchResults": 1,
  "nonExistentResults": 1
}

### ✅ find_references Tool
- **Duration:** 21ms
- **Details:** {
  "referencesFound": 8,
  "includeDeclaration": true,
  "scope": "workspace"
}

### ✅ rename_symbol Tool
- **Duration:** 113ms
- **Details:** {
  "changesCount": 0,
  "preview": true,
  "scope": "exact",
  "totalEdits": 0
}

### ✅ generate_tests Tool
- **Duration:** 12ms
- **Details:** {
  "status": "not_implemented",
  "target": "src/servers/mcp-fast.ts",
  "framework": "bun",
  "coverage": "comprehensive"
}

### ❌ Error Scenarios
- **Duration:** 43ms
- **Details:** {
  "tests": [
    {
      "name": "Invalid tool",
      "passed": false,
      "details": {
        "hasJsonRpcError": false,
        "hasResultError": false,
        "hasAnyError": false,
        "result": {
          "content": [
            {
              "type": "text",
              "text": "\"Unknown tool: invalid_tool_that_does_not_exist. Valid tools: get_snapshot, workflow_safe_rename, workflow_explore_symbol, workflow_quick_patch_checks, workflow_locate_confirm_definition, ast_query, graph_expand, propose_patch, run_checks, apply_snapshot, find_definition, rename_symbol, find_references, explore_codebase, build_symbol_map, plan_rename, apply_rename, text_search, symbol_search, list_files, get_completions, list_symbols, diagnostics, pattern_stats, generate_tests, knowledge_insights, cache_controls, suggest_refactoring\""
            }
          ],
          "isError": false
        }
      }
    },
    {
      "name": "Missing parameters",
      "passed": false,
      "details": {
        "hasJsonRpcError": false,
        "hasResultError": false,
        "hasAnyError": false,
        "result": {
          "content": [
            {
              "type": "text",
              "text": "Missing required parameter: symbol"
            }
          ],
          "isError": false
        }
      }
    },
    {
      "name": "Invalid JSON-RPC method",
      "passed": true,
      "details": {
        "hasError": true,
        "isMethodNotFound": true,
        "error": {
          "code": -32601,
          "message": "Method not found"
        }
      }
    },
    {
      "name": "Malformed arguments",
      "passed": true,
      "details": {
        "handledGracefully": true,
        "error": {
          "code": -32603,
          "message": "[\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"object\",\n    \"received\": \"string\",\n    \"path\": [\n      \"params\",\n      \"arguments\"\n    ],\n    \"message\": \"Expected object, received string\"\n  }\n]"
        }
      }
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 2,
    "total": 4,
    "failedTests": [
      "Invalid tool",
      "Missing parameters"
    ]
  }
}

### ✅ Performance Benchmarks
- **Duration:** 1489ms
- **Details:** {
  "toolListAvg": 10.4,
  "findDefAvg": 98.66666666666667,
  "findRefAvg": 10.666666666666666,
  "requirements": {
    "toolList": "<100ms",
    "findDef": "<5000ms",
    "findRef": "<5000ms"
  },
  "results": {
    "toolListPassed": true,
    "findDefPassed": true,
    "findRefPassed": true
  }
}

## Recommendations

- Fix Error Scenarios: Unknown error
