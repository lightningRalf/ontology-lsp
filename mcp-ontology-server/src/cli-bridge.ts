/**
 * CLI Bridge for MCP Server
 * 
 * This module provides a bridge to the ontology-lsp CLI,
 * allowing the MCP server to execute CLI commands and get JSON results.
 */

import { spawn } from "child_process"
import { promisify } from "util"
import { exec as execCallback } from "child_process"

const exec = promisify(execCallback)

export interface CLIResult {
  success: boolean
  data?: any
  error?: string
}

export class CLIBridge {
  private cliPath: string
  private lspPort: number

  constructor(cliPath: string = "ontology-lsp", lspPort: number = 7000) {
    this.cliPath = cliPath
    this.lspPort = lspPort
  }

  /**
   * Execute a CLI command and return the result
   */
  private async execute(command: string, args: string[] = []): Promise<CLIResult> {
    try {
      // Always add --json flag and port
      const fullArgs = [command, ...args, "--json", "-p", this.lspPort.toString()]
      
      const { stdout, stderr } = await exec(`${this.cliPath} ${fullArgs.join(" ")}`)
      
      // Try to parse JSON output
      try {
        const data = JSON.parse(stdout)
        return { success: !data.error, data, error: data.error }
      } catch {
        // If not JSON, return raw output
        return { success: true, data: stdout.trim() }
      }
    } catch (error: any) {
      // Check if the error output is JSON
      try {
        const errorData = JSON.parse(error.stdout || error.stderr)
        return { success: false, error: errorData.error || error.message, data: errorData }
      } catch {
        return { success: false, error: error.message }
      }
    }
  }

  /**
   * Find occurrences of an identifier
   */
  async find(identifier: string, options: { fuzzy?: boolean; semantic?: boolean } = {}) {
    const args = [identifier]
    if (options.fuzzy) args.push("--fuzzy")
    if (options.semantic) args.push("--semantic")
    
    return this.execute("find", args)
  }

  /**
   * Get refactoring suggestions
   */
  async suggest(identifier: string, confidence: number = 0.7) {
    return this.execute("suggest", [identifier, "-c", confidence.toString()])
  }

  /**
   * Analyze a codebase
   */
  async analyze(path: string = ".") {
    return this.execute("analyze", [path])
  }

  /**
   * Get statistics
   */
  async stats(options: { patterns?: boolean; concepts?: boolean } = {}) {
    const args = []
    if (options.patterns) args.push("--patterns")
    if (options.concepts) args.push("--concepts")
    
    return this.execute("stats", args)
  }

  /**
   * Export ontology data
   */
  async export() {
    return this.execute("export")
  }

  /**
   * Import ontology data
   */
  async import(data: any) {
    // Write data to temp file since we can't pipe JSON through CLI easily
    const fs = await import("fs/promises")
    const path = await import("path")
    const os = await import("os")
    
    const tmpFile = path.join(os.tmpdir(), `ontology-import-${Date.now()}.json`)
    await fs.writeFile(tmpFile, JSON.stringify(data))
    
    try {
      const result = await this.execute("import", [tmpFile])
      await fs.unlink(tmpFile).catch(() => {}) // Clean up
      return result
    } catch (error) {
      await fs.unlink(tmpFile).catch(() => {}) // Clean up
      throw error
    }
  }

  /**
   * Clear cache
   */
  async clearCache() {
    return this.execute("clear-cache")
  }

  /**
   * Optimize database
   */
  async optimize() {
    return this.execute("optimize")
  }

  /**
   * Check if LSP server is running
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.lspPort}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Start the LSP server
   */
  async startServer(stdio: boolean = false): Promise<void> {
    const args = ["start"]
    if (stdio) {
      args.push("--stdio")
    } else {
      args.push("-p", this.lspPort.toString())
    }

    return new Promise((resolve, reject) => {
      const server = spawn(this.cliPath, args, {
        detached: true,
        stdio: "ignore"
      })

      server.on("error", reject)
      
      // Give server time to start
      setTimeout(() => {
        server.unref()
        resolve()
      }, 2000)
    })
  }
}