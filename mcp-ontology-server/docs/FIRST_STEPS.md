# 🚀 First Steps with Ontology MCP Server

Welcome! This guide will help you get started with the Ontology MCP Server in just a few minutes. We'll focus on the 20% of features that provide 80% of the value.

## 📋 Table of Contents
- [Quick Setup](#quick-setup)
- [Your First Commands](#your-first-commands)
- [Essential Tools](#essential-tools)
- [Key Resources](#key-resources)
- [Power Prompts](#power-prompts)
- [Common Workflows](#common-workflows)
- [What's Next](#whats-next)

## Quick Setup

### 1. Start the Server

```bash
# Navigate to the MCP server directory
cd /path/to/mcp-ontology-server

# Start the SSE server
~/.bun/bin/bun run src/sse-server.ts
```

You should see:
```
🚀 Ontology MCP Server (SSE) is running!
Endpoints:
- Health:    http://localhost:7001/health
- SSE:       http://localhost:7001/mcp/sse
- Messages:  http://localhost:7001/mcp/messages
```

### 2. Connect Claude Code

In a new terminal:

```bash
# Add the server to Claude Code (user scope = available everywhere)
claude mcp add --transport sse ontology-lsp --scope user http://localhost:7001/mcp/sse

# Verify connection
claude mcp list
```

### 3. Test the Connection

In Claude Code, type:
```
/mcp
```

You should see `ontology-lsp` listed as connected.

## Your First Commands

Start with these simple commands to explore your codebase:

### 1. 🔍 **"Find the definition of [ClassName]"**
```
Find the definition of UserService
```
This uses the `find_definition` tool with fuzzy matching - even if you misspell it slightly, it'll find it!

### 2. 📊 **"Analyze this codebase"**
```
Analyze this codebase and tell me about its architecture
```
This triggers the comprehensive `analyze_codebase` prompt, using all 5 layers to understand your code.

### 3. 🎯 **"What patterns are in this file?"**
```
What patterns and anti-patterns exist in src/services/auth.ts?
```
Detects both good design patterns and potential issues.

### 4. ♻️ **"Suggest improvements"**
```
Suggest refactoring for the UserController class
```
Gets AI-powered suggestions based on learned patterns from your codebase.

### 5. 📈 **"Show me the code quality"**
```
What's the overall code quality and technical debt?
```
Accesses the `codebase://quality` resource for metrics.

## Essential Tools

These 5 tools cover 80% of your daily needs:

### 1. **`find_definition`** - Navigate to Symbols
The most-used navigation tool. Supports fuzzy matching!

**Example uses:**
- "Where is the PaymentProcessor class defined?"
- "Find definition of calcTotal function"
- "Show me where API_KEY is defined"

### 2. **`find_references`** - Understand Impact
See everywhere a symbol is used before making changes.

**Example uses:**
- "Show all references to the User model"
- "Where is calculateDiscount() called?"
- "Find all uses of the DEPRECATED_FLAG"

### 3. **`suggest_refactoring`** - Get Improvements
Leverages learned patterns to suggest better code.

**Example uses:**
- "How can I refactor this OrderService?"
- "Suggest improvements for the auth module"
- "What refactoring would reduce complexity here?"

### 4. **`rename_symbol`** - Smart Renaming
Renames with intelligent propagation across related code.

**Example uses:**
- "Rename getUserData to fetchUserProfile everywhere"
- "Change all occurrences of oldAPI to legacyAPI"
- "Rename this variable to follow our naming conventions"

### 5. **`detect_patterns`** - Find Issues Early
Identifies both design patterns and anti-patterns.

**Example uses:**
- "Check for anti-patterns in the payment module"
- "What design patterns are used in our services?"
- "Find potential code smells"

## Key Resources

Monitor these 3 resources for codebase insights:

### 1. **`ontology://concepts`** - Your Knowledge Graph
Shows how concepts in your code relate to each other.

**Check with:**
```
Show me the ontology concepts and their relationships
```

### 2. **`patterns://learned`** - What the System Learned
See patterns the AI has learned from your refactorings.

**Check with:**
```
What patterns have been learned from this codebase?
```

### 3. **`codebase://quality`** - Health Metrics
Overall quality metrics and technical debt tracking.

**Check with:**
```
Display the code quality metrics
```

## Power Prompts

Start with these 2 prompts for instant insights:

### 1. **`analyze_codebase`** - Complete Analysis
```
Analyze the entire codebase architecture, patterns, and quality
```

**What it does:**
- Maps architecture patterns
- Identifies key components
- Finds potential issues
- Suggests improvements

### 2. **`suggest_refactoring`** - Actionable Improvements
```
Suggest refactoring for [file/class/module]
```

**What it does:**
- Analyzes code complexity
- Applies learned patterns
- Provides step-by-step refactoring plan
- Estimates impact

## Common Workflows

### 🔧 **Refactoring Workflow**

1. Find what needs refactoring:
   ```
   What are the most complex parts of the codebase?
   ```

2. Analyze dependencies:
   ```
   Show dependencies for the UserService class
   ```

3. Get suggestions:
   ```
   Suggest refactoring for UserService with minimal risk
   ```

4. Apply with preview:
   ```
   Rename oldMethod to newMethod and show me what would change
   ```

### 🐛 **Debugging Workflow**

1. Find the problematic code:
   ```
   Find definition of the ErrorHandler class
   ```

2. Check usage:
   ```
   Show all references to ErrorHandler.logError
   ```

3. Understand relationships:
   ```
   What concepts are related to ErrorHandler?
   ```

4. Get explanation:
   ```
   Explain how the error handling flow works
   ```

### 📝 **Documentation Workflow**

1. Analyze component:
   ```
   Analyze the auth module architecture
   ```

2. Generate docs:
   ```
   Generate documentation for the AuthService class
   ```

3. Find examples:
   ```
   Find similar authentication patterns in the codebase
   ```

### 🏗️ **Architecture Review Workflow**

1. Get overview:
   ```
   Show me the codebase architecture
   ```

2. Check patterns:
   ```
   What architectural patterns are used?
   ```

3. Find issues:
   ```
   Detect architectural anti-patterns
   ```

4. Get suggestions:
   ```
   Suggest architectural improvements
   ```

## What's Next

### Level Up Your Usage

Once comfortable with the basics, explore:

1. **Pattern Learning**: Teach the system new patterns
   ```
   Learn this refactoring pattern: [show before/after code]
   ```

2. **Performance Optimization**:
   ```
   Optimize performance for the search algorithm
   ```

3. **Test Generation**:
   ```
   Generate comprehensive tests for the PaymentService
   ```

4. **Migration Planning**:
   ```
   Create a migration plan from Express to Fastify
   ```

### Advanced Features

- **Custom Prompts**: Combine multiple tools for complex tasks
- **Resource Monitoring**: Track pattern usage and system learning
- **Batch Operations**: Apply refactorings across multiple files
- **Integration**: Connect with your CI/CD pipeline

### Tips for Success

1. **Start Small**: Begin with navigation and gradually explore refactoring
2. **Be Specific**: More specific queries get better results
3. **Use Natural Language**: The system understands context
4. **Preview First**: Always preview changes before applying
5. **Learn Patterns**: The more you refactor, the smarter it gets

### Getting Help

- **Check server status**: `/mcp` in Claude Code
- **View all tools**: "List all available MCP tools"
- **See resources**: "Show all MCP resources"
- **Get examples**: "Show me examples of using [tool name]"

---

## 🎉 You're Ready!

You now know the essential 20% that provides 80% of the value. Start with finding definitions, analyzing your codebase, and getting refactoring suggestions. The system will learn from your patterns and become more helpful over time.

**Remember**: The ontology MCP server gets smarter as you use it - it learns from your refactoring patterns and applies them to similar code!

Happy coding! 🚀