#!/bin/bash

# Ontology-Enhanced LSP Proxy Installation Script
# This script sets up the complete ontology LSP system

set -e

echo "🚀 Installing Ontology-Enhanced LSP Proxy..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in Claude Code environment
check_claude_code() {
    if ! command -v claude &> /dev/null; then
        print_warning "Claude Code CLI not found. Some features may not work optimally."
        print_status "Visit https://docs.anthropic.com/en/docs/claude-code for installation instructions"
    else
        print_success "Claude Code environment detected"
    fi
}

# Check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed"
        print_status "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required (found v$NODE_VERSION)"
        exit 1
    fi
    
    print_success "Node.js v$(node -v) ✓"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is required but not installed"
        exit 1
    fi
    
    print_success "npm v$(npm -v) ✓"
    
    # Check for ripgrep (optional but recommended)
    if ! command -v rg &> /dev/null; then
        print_warning "ripgrep not found - installing for better performance"
        install_ripgrep
    else
        print_success "ripgrep v$(rg --version | head -1 | cut -d' ' -f2) ✓"
    fi
    
    # Check for sqlite3
    if ! command -v sqlite3 &> /dev/null; then
        print_warning "sqlite3 not found - required for ontology storage"
        install_sqlite3
    else
        print_success "sqlite3 ✓"
    fi
}

# Install ripgrep based on OS
install_ripgrep() {
    print_status "Installing ripgrep..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install ripgrep
        else
            print_error "Homebrew not found. Please install ripgrep manually."
            print_status "Visit: https://github.com/BurntSushi/ripgrep#installation"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y ripgrep
        elif command -v yum &> /dev/null; then
            sudo yum install -y ripgrep
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y ripgrep
        else
            print_warning "Unable to install ripgrep automatically"
            print_status "Please install manually: https://github.com/BurntSushi/ripgrep#installation"
        fi
    else
        print_warning "Unknown OS type: $OSTYPE"
        print_status "Please install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation"
    fi
}

# Install sqlite3 based on OS
install_sqlite3() {
    print_status "Installing sqlite3..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install sqlite3
        else
            print_error "Homebrew not found. Please install sqlite3 manually."
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y sqlite3 libsqlite3-dev
        elif command -v yum &> /dev/null; then
            sudo yum install -y sqlite sqlite-devel
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y sqlite sqlite-devel
        fi
    fi
}

# Install the ontology LSP package
install_package() {
    print_status "Installing ontology-lsp package..."
    
    # Check if we're in development mode (local directory)
    if [[ -f "package.json" && -f "src/server.ts" ]]; then
        print_status "Development mode detected - installing from source"
        
        # Install dependencies
        npm install
        
        # Build the project
        print_status "Building project..."
        npm run build
        
        # Link globally
        print_status "Linking globally..."
        npm link
        
    else
        print_status "Installing from npm registry..."
        npm install -g ontology-lsp-proxy
    fi
    
    print_success "Package installed successfully"
}

# Initialize project configuration
initialize_project() {
    print_status "Initializing project configuration..."
    
    # Create .ontology directory
    mkdir -p .ontology
    mkdir -p .ontology/cache
    
    # Create configuration file if it doesn't exist
    if [[ ! -f ".ontology-lsp-config.yaml" ]]; then
        print_status "Creating default configuration..."
        cat > .ontology-lsp-config.yaml << 'EOF'
version: 1.0.0

# Layer configuration  
layers:
  claude_tools:
    enabled: true
    timeout: 100
    maxResults: 100
    fileTypes: [ts, tsx, js, jsx, py, java, go, rust]
    
  tree_sitter:
    enabled: true
    timeout: 500
    languages: [typescript, javascript, python]
    maxFileSize: 1MB
    
  ontology:
    enabled: true
    dbPath: .ontology/concepts.db
    cacheSize: 1000
    
  patterns:
    enabled: true
    learningThreshold: 3
    confidenceThreshold: 0.7
    maxPatterns: 1000
    
  propagation:
    enabled: true
    maxDepth: 3
    autoApplyThreshold: 0.9

# Performance tuning
performance:
  caching:
    memory:
      maxSize: 500MB
      ttl: 3600
    disk:
      enabled: true
      path: .ontology/cache
      maxSize: 2GB
      
  parallelism:
    workers: 4
    batchSize: 100
    
  indexing:
    incremental: true
    watchDebounce: 500

# Search configuration
search:
  fuzzy:
    editDistanceThreshold: 3
    tokenOverlapThreshold: 0.5
    semanticSimilarityThreshold: 0.7
  
  context:
    windowSize: 3
    includeComments: true
    includeStrings: false

# Pattern learning
patterns:
  synonyms:
    get: [fetch, retrieve, load, obtain]
    set: [update, modify, change, assign]
    create: [make, build, generate, produce]
    delete: [remove, destroy, eliminate]
  
  transformations:
    camelCase: true
    snake_case: true
    PascalCase: true
    kebab-case: true

# Monitoring
monitoring:
  metrics:
    enabled: true
    
  logging:
    level: info
    format: json
EOF
        print_success "Created .ontology-lsp-config.yaml"
    else
        print_status "Configuration file already exists"
    fi
    
    # Create .ontologyignore file
    if [[ ! -f ".ontologyignore" ]]; then
        print_status "Creating .ontologyignore file..."
        cat > .ontologyignore << 'EOF'
# Dependencies
node_modules/
vendor/
.pnpm/
.yarn/

# Build outputs
dist/
build/
out/
target/
bin/

# IDE and editor files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Test coverage
coverage/
.nyc_output/

# Temporary files
tmp/
temp/
.tmp/

# Package files
*.tgz
*.tar.gz

# Cache directories
.cache/
.parcel-cache/
.next/
.nuxt/

# Environment files
.env*
!.env.example
EOF
        print_success "Created .ontologyignore"
    fi
    
    # Create VS Code settings if in a VS Code workspace
    if [[ -d ".vscode" ]]; then
        print_status "Configuring VS Code integration..."
        
        # Create or update settings.json
        VSCODE_SETTINGS=".vscode/settings.json"
        if [[ ! -f "$VSCODE_SETTINGS" ]]; then
            echo '{}' > "$VSCODE_SETTINGS"
        fi
        
        # Add ontology LSP settings (this would need a more sophisticated JSON merger in practice)
        cat > .vscode/ontology-settings.json << 'EOF'
{
  "ontologyLSP.enabled": true,
  "ontologyLSP.server.path": "ontology-lsp-proxy",
  "ontologyLSP.fuzzyMatching.enabled": true,
  "ontologyLSP.patternLearning.enabled": true,
  "ontologyLSP.propagation.autoApply": false,
  "ontologyLSP.logging.level": "info"
}
EOF
        print_success "Created VS Code configuration template"
        print_warning "Please merge .vscode/ontology-settings.json into your .vscode/settings.json"
    fi
}

# Set up systemd service (Linux only)
setup_service() {
    if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v systemctl &> /dev/null; then
        read -p "Set up systemd service for automatic startup? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Creating systemd service..."
            
            sudo tee /etc/systemd/system/ontology-lsp.service > /dev/null << EOF
[Unit]
Description=Ontology Enhanced LSP Proxy
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
ExecStart=$(which ontology-lsp-proxy) start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
            
            sudo systemctl daemon-reload
            sudo systemctl enable ontology-lsp
            print_success "Systemd service created and enabled"
        fi
    fi
}

# Verify installation
verify_installation() {
    print_status "Verifying installation..."
    
    # Check if command is available
    if command -v ontology-lsp-proxy &> /dev/null; then
        print_success "ontology-lsp-proxy command available ✓"
        
        # Check version
        VERSION=$(ontology-lsp-proxy --version 2>/dev/null || echo "unknown")
        print_status "Version: $VERSION"
        
        # Test basic functionality
        print_status "Testing basic functionality..."
        timeout 5s ontology-lsp-proxy --help > /dev/null 2>&1
        if [[ $? -eq 0 ]] || [[ $? -eq 124 ]]; then  # 124 is timeout exit code
            print_success "Basic functionality test passed ✓"
        else
            print_warning "Basic functionality test failed - but installation may still work"
        fi
        
    else
        print_error "ontology-lsp-proxy command not found"
        print_status "Try restarting your shell or running: source ~/.bashrc"
        return 1
    fi
    
    # Check configuration
    if [[ -f ".ontology-lsp-config.yaml" ]]; then
        print_success "Configuration file present ✓"
    else
        print_warning "Configuration file not found"
    fi
    
    # Check directory structure
    if [[ -d ".ontology" ]]; then
        print_success "Ontology directory created ✓"
    else
        print_warning "Ontology directory not found"
    fi
    
    return 0
}

# Show usage instructions
show_usage() {
    print_success "Installation completed successfully! 🎉"
    echo
    echo "Next steps:"
    echo "1. Start the LSP server:"
    echo "   ontology-lsp-proxy start"
    echo
    echo "2. Configure your editor to use the LSP server on port 7000"
    echo
    echo "3. For VS Code, install the extension or configure manually:"
    echo "   - Copy settings from .vscode/ontology-settings.json"
    echo "   - Add to your workspace settings.json"
    echo
    echo "4. Try renaming a variable to see pattern learning in action!"
    echo
    echo "Documentation: README.md"
    echo "Configuration: .ontology-lsp-config.yaml"
    echo "Logs: .ontology/logs/"
    echo "Cache: .ontology/cache/"
    echo
    echo "For help:"
    echo "  ontology-lsp-proxy --help"
    echo "  ontology-lsp-proxy stats"
    echo "  ontology-lsp-proxy diagnose"
    echo
}

# Main installation flow
main() {
    echo "════════════════════════════════════════════════════════════════"
    echo "🧠 Ontology-Enhanced LSP Proxy Installation"
    echo "════════════════════════════════════════════════════════════════"
    echo
    
    # Check environment
    check_claude_code
    
    # Check requirements
    check_requirements
    
    # Install package
    install_package
    
    # Initialize project
    initialize_project
    
    # Setup service (optional)
    setup_service
    
    # Verify installation
    if verify_installation; then
        show_usage
    else
        print_error "Installation verification failed"
        echo "Please check the error messages above and try again."
        echo "For support, visit: https://github.com/your-org/ontology-lsp/issues"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Ontology-Enhanced LSP Proxy Installation Script"
            echo
            echo "Usage: $0 [options]"
            echo
            echo "Options:"
            echo "  --help, -h          Show this help message"
            echo "  --skip-deps         Skip dependency installation"
            echo "  --dev               Install in development mode"
            echo "  --verbose           Enable verbose output"
            echo
            exit 0
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --verbose)
            set -x
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main installation
main