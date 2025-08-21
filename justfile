# Ontology LSP Commands

# Build the LSP server
build:
    ~/.bun/bin/bun build ./src/server.ts --target=bun --outdir=dist --format=esm

# Build the VS Code extension
build-extension:
    cd vscode-client && npm install && npm run compile

# Build everything
build-all: build build-extension

# Package the VS Code extension
package-extension:
    cd vscode-client && npx @vscode/vsce package

# Install the extension in VS Code
install-extension: build-all package-extension
    code --install-extension vscode-client/ontology-lsp-*.vsix

# Start the LSP server
start:
    ~/.bun/bin/bun run dist/server.js --stdio

# Check server status
status:
    @echo "Checking LSP server status..."
    @ps aux | grep "node dist/server.js" | grep -v grep || echo "LSP server is not running"
    @echo "Build status:"
    @[ -f dist/server.js ] && echo "✓ Server built" || echo "✗ Server not built (run 'just build')"
    @[ -f vscode-client/out/extension.js ] && echo "✓ Extension built" || echo "✗ Extension not built (run 'just build-extension')"
    @echo "Test status:"
    @[ -d vscode-client/out/test ] && echo "✓ Tests compiled" || echo "✗ Tests not compiled"

# Run all tests
test-all: test test-extension

# Run server tests with Bun
test:
    ~/.bun/bin/bun test tests/step*.test.ts tests/integration.test.ts

# Run extension tests
test-extension:
    cd vscode-client && npm test

# Run unit tests only
test-unit:
    ~/.bun/bin/bun test tests/step*.test.ts

# Run integration tests only
test-integration:
    ~/.bun/bin/bun test tests/integration.test.ts

# Run performance tests only
test-perf:
    ~/.bun/bin/bun test tests/integration.test.ts --grep "Performance"

# Run tests with coverage
test-coverage:
    ~/.bun/bin/bun test --coverage

# Run tests in watch mode
test-watch:
    ~/.bun/bin/bun test --watch

# Run linter
lint:
    ~/.bun/bin/bun run lint
    cd vscode-client && npm run lint

# Clean and rebuild
clean:
    npm run clean
    npm run build
    cd vscode-client && rm -rf out node_modules coverage .nyc_output

# Development mode (auto-restart)
dev:
    ~/.bun/bin/bun run src/server.ts --stdio

# Open VS Code with extension in development mode
dev-extension:
    cd vscode-client && code .

# Install all dependencies
install-deps:
    npm install
    cd vscode-client && npm install

# Full CI/CD simulation
ci: clean install-deps build-all lint test-all test-coverage package-extension
    @echo "✓ CI pipeline complete!"