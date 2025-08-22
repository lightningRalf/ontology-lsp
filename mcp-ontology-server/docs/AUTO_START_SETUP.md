# 🚀 Automatic MCP Server Startup Setup

This guide explains how to configure the Ontology MCP Server to start automatically when you open Claude Code in your project.

## Why Automatic Startup?

With automatic startup configured:
- ✅ No manual server management needed
- ✅ MCP server starts when Claude Code opens
- ✅ Claude immediately knows about all 16 ontology tools
- ✅ Team members get the same setup automatically
- ✅ Graceful handling of edge cases

## Setup Instructions

### Step 1: Copy the Hook Scripts

The hook scripts manage the MCP server lifecycle. Copy them to your project:

```bash
# Create the hooks directory
mkdir -p .claude/hooks

# Copy the startup and shutdown scripts
cp /path/to/mcp-ontology-server/docs/examples/start-mcp-server.sh .claude/hooks/
cp /path/to/mcp-ontology-server/docs/examples/stop-mcp-server.sh .claude/hooks/

# Make them executable
chmod +x .claude/hooks/start-mcp-server.sh
chmod +x .claude/hooks/stop-mcp-server.sh
```

**What the scripts do:**

**start-mcp-server.sh:**
- Checks if the server is already running (avoids duplicates)
- Starts the server if needed
- Handles port conflicts gracefully
- Provides context to Claude about available tools
- Non-blocking - session continues even if server fails

**stop-mcp-server.sh:**
- Gracefully shuts down the server when session ends
- Tries SIGTERM first, then SIGKILL if needed
- Cleans up PID files
- Prevents orphaned processes
- Provides session summary

### Step 2: Configure Claude Code Settings

Create or update `.claude/settings.json` in your project root:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/start-mcp-server.sh",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "resume",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/start-mcp-server.sh",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "clear",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/start-mcp-server.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-mcp-server.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**What this configures:**
- **SessionStart hooks** run when Claude Code starts
- **Stop hook** runs when Claude Code session ends
- **Matchers** trigger on `startup`, `resume`, and `clear` events
- **`$CLAUDE_PROJECT_DIR`** ensures portability across machines
- **Timeouts** prevent hanging (10s for start, 5s for stop)

### Step 3: Add MCP Configuration

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ontology-lsp": {
      "type": "sse",
      "url": "http://localhost:7001/mcp/sse",
      "description": "Ontology-enhanced LSP with 5-layer intelligent code understanding"
    }
  }
}
```

**What this provides:**
- Project-level MCP server configuration
- Automatically detected by Claude Code
- Can be committed to version control for team sharing
- Uses SSE transport for real-time features

## Customization Options

### Change the Port

Set the `MCP_SSE_PORT` environment variable:

```bash
# In your shell configuration (.bashrc, .zshrc, etc.)
export MCP_SSE_PORT=8080
```

Or modify the hook script:
```bash
MCP_PORT="${MCP_SSE_PORT:-8080}"  # Change default from 7001 to 8080
```

### Adjust Timeouts

In `.claude/settings.json`, modify the timeout value:
```json
"timeout": 30  // Increase to 30 seconds for slower systems
```

### Disable Auto-Start for Specific Sessions

If you need to prevent auto-start temporarily:
```bash
# Start Claude Code without hooks
claude --no-hooks
```

## Verification

### Check if Setup is Working

1. **Close Claude Code** completely
2. **Open Claude Code** in your project directory
3. **Check the server status**:
   ```
   /mcp
   ```
   You should see `ontology-lsp` listed as connected.

4. **Test a command**:
   ```
   Find the definition of UserService
   ```

### Check Server Logs

If there are issues, check the logs:
```bash
# View server logs
tail -f /tmp/ontology-mcp-server-7001.log

# Check if server is running
ps aux | grep sse-server
```

### Manual Server Control

If needed, you can still control the server manually:

```bash
# Stop the server
kill $(cat /tmp/ontology-mcp-server-7001.pid)

# Start manually
cd /path/to/mcp-ontology-server
~/.bun/bin/bun run src/sse-server.ts
```

## Troubleshooting

### Server Doesn't Start

1. **Check Bun installation**:
   ```bash
   ~/.bun/bin/bun --version
   ```
   If not installed: `curl -fsSL https://bun.sh/install | bash`

2. **Check hook script permissions**:
   ```bash
   ls -la .claude/hooks/start-mcp-server.sh
   # Should show executable permissions (x)
   ```

3. **Check port availability**:
   ```bash
   lsof -i :7001
   ```

### Claude Doesn't See the Tools

1. **Verify MCP configuration**:
   ```bash
   cat .mcp.json
   ```

2. **Check server health**:
   ```bash
   curl http://localhost:7001/health
   ```

3. **Review Claude Code's MCP list**:
   ```
   /mcp
   ```

### Port Conflicts

If port 7001 is in use:

1. **Find what's using it**:
   ```bash
   lsof -i :7001
   ```

2. **Either stop that process or change the port**:
   ```bash
   export MCP_SSE_PORT=8080
   ```

## Team Setup

To share this configuration with your team:

1. **Commit these files to version control**:
   ```bash
   git add .claude/hooks/start-mcp-server.sh
   git add .claude/hooks/stop-mcp-server.sh
   git add .claude/settings.json
   git add .mcp.json
   git commit -m "Add MCP server lifecycle management hooks"
   ```

2. **Team members just need to**:
   - Pull the latest changes
   - Ensure Bun is installed
   - Open Claude Code - everything starts automatically!

## Security Notes

- The hook script runs with your user permissions
- Server listens on localhost only by default
- No authentication required for local connections
- Consider firewall rules if changing to non-localhost binding

## Next Steps

Once automatic startup is configured:

1. **Read the First Steps Guide**: [docs/FIRST_STEPS.md](FIRST_STEPS.md)
2. **Explore the 16 available tools**
3. **Try the power prompts** for instant insights
4. **Teach the system** new patterns from your refactorings

The server will now start automatically every time you work on this project with Claude Code!