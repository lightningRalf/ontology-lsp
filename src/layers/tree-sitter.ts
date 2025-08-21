// Tree-sitter AST Analysis Layer
import Parser, { SyntaxNode, Tree, Query } from 'tree-sitter';
import { Layer, EnhancedMatches, ASTNode, NodeMetadata } from '../types/core';
import { TreeSitterConfig } from '../types/core';
import * as fs from 'fs/promises';
import * as path from 'path';

// Re-export ASTNode for other modules
export { ASTNode } from '../types/core';

// Language imports - only load what we need
let TypeScript: any = null;
let JavaScript: any = null; 
let Python: any = null;

try {
    TypeScript = require('tree-sitter-typescript').typescript;
    JavaScript = require('tree-sitter-typescript').javascript;
} catch (e) {
    console.warn('Failed to load TypeScript/JavaScript parsers:', e);
}

try {
    Python = require('tree-sitter-python');
} catch (e) {
    console.warn('Failed to load Python parser:', e);
}

export interface TreeSitterResult {
    nodes: ASTNode[];
    relationships: Relationship[];
    patterns: DesignPattern[];
    parseTime: number;
    files: string[];
}

interface Relationship {
    from: string;
    to: string;
    type: 'calls' | 'extends' | 'implements' | 'imports' | 'references';
    confidence: number;
    location: string;
}

interface DesignPattern {
    name: string;
    type: 'factory' | 'singleton' | 'observer' | 'strategy' | 'decorator';
    confidence: number;
    nodes: string[];
    description: string;
}

export class TreeSitterLayer implements Layer<EnhancedMatches, TreeSitterResult> {
    name = 'TreeSitterLayer';
    timeout = 2000; // 2 second timeout
    
    private parsers = new Map<string, Parser>();
    private queries = new Map<string, Map<string, Query>>();
    private cache = new Map<string, { tree: Tree; timestamp: number }>();
    
    constructor(private config: TreeSitterConfig) {
        this.setupParsers();
        this.setupQueries();
    }
    
    private setupParsers(): void {
        const languages: { [key: string]: any } = {};
        
        // Only add languages that are available and loaded
        if (this.config.languages.includes('typescript') && TypeScript) {
            languages['typescript'] = TypeScript;
        }
        
        if (this.config.languages.includes('javascript') && JavaScript) {
            languages['javascript'] = JavaScript;
        }
        
        if (this.config.languages.includes('python') && Python) {
            languages['python'] = Python;
        }
        
        for (const [name, language] of Object.entries(languages)) {
            try {
                const parser = new Parser();
                parser.setLanguage(language);
                this.parsers.set(name, parser);
                console.log(`Initialized ${name} parser`);
            } catch (e) {
                console.warn(`Failed to initialize ${name} parser:`, e);
            }
        }
    }
    
    private setupQueries(): void {
        // TypeScript/JavaScript queries
        const tsQueries = {
            identifiers: `
                (identifier) @id
                (property_identifier) @prop
                (type_identifier) @type
            `,
            
            functions: `
                (function_declaration
                    name: (identifier) @func.name
                    parameters: (formal_parameters) @func.params
                    body: (statement_block) @func.body)
                
                (arrow_function
                    parameters: (formal_parameters) @arrow.params
                    body: (_) @arrow.body)
                
                (method_definition
                    name: (property_identifier) @method.name
                    parameters: (formal_parameters) @method.params
                    body: (statement_block) @method.body)
            `,
            
            classes: `
                (class_declaration
                    name: (type_identifier) @class.name
                    (class_heritage
                        (extends_clause
                            (identifier) @class.extends))?
                    (class_heritage
                        (implements_clause
                            (type_identifier) @class.implements)*)?
                    body: (class_body) @class.body)
            `,
            
            imports: `
                (import_statement
                    source: (string) @import.source
                    (import_clause
                        (named_imports
                            (import_specifier
                                name: (identifier) @import.name
                                alias: (identifier)? @import.alias)*)?
                        (namespace_import
                            (identifier) @import.namespace)?
                        (identifier)? @import.default)?)
            `,
            
            exports: `
                (export_statement
                    (function_declaration
                        name: (identifier) @export.func)?
                    (class_declaration
                        name: (type_identifier) @export.class)?
                    (variable_declaration
                        (variable_declarator
                            name: (identifier) @export.var))?
                    declaration: (_)? @export.decl)
            `,
            
            calls: `
                (call_expression
                    function: (identifier) @call.func
                    arguments: (arguments) @call.args)
                
                (call_expression
                    function: (member_expression
                        object: (identifier) @call.object
                        property: (property_identifier) @call.method)
                    arguments: (arguments) @call.args)
            `,
            
            references: `
                (member_expression
                    object: (identifier) @ref.object
                    property: (property_identifier) @ref.property)
                
                (assignment_expression
                    left: (identifier) @assign.target
                    right: (_) @assign.value)
            `
        };
        
        // Setup queries for TypeScript/JavaScript
        const tsQueryMap = new Map<string, Query>();
        for (const [name, queryString] of Object.entries(tsQueries)) {
            if (TypeScript) {
                tsQueryMap.set(name, new Query(TypeScript, queryString));
            }
        }
        
        this.queries.set('typescript', tsQueryMap);
        this.queries.set('javascript', tsQueryMap);
        
        // Python queries
        const pythonQueries = {
            identifiers: `
                (identifier) @id
            `,
            
            functions: `
                (function_definition
                    name: (identifier) @func.name
                    parameters: (parameters) @func.params
                    body: (block) @func.body)
            `,
            
            classes: `
                (class_definition
                    name: (identifier) @class.name
                    superclasses: (argument_list
                        (identifier) @class.extends)*
                    body: (block) @class.body)
            `,
            
            imports: `
                (import_statement
                    name: (dotted_name) @import.module)
                
                (import_from_statement
                    module_name: (dotted_name) @import.from
                    name: (dotted_name) @import.name)
            `
        };
        
        if (Python) {
            const pythonQueryMap = new Map<string, Query>();
            for (const [name, queryString] of Object.entries(pythonQueries)) {
                pythonQueryMap.set(name, new Query(Python, queryString));
            }
            this.queries.set('python', pythonQueryMap);
        }
    }
    
    async process(matches: EnhancedMatches): Promise<TreeSitterResult> {
        const startTime = Date.now();
        const result: TreeSitterResult = {
            nodes: [],
            relationships: [],
            patterns: [],
            parseTime: 0,
            files: []
        };
        
        // Get unique files from matches
        const filesToParse = new Set<string>();
        
        [...matches.exact, ...matches.fuzzy, ...matches.conceptual].forEach(match => {
            filesToParse.add(match.file);
        });
        
        matches.files.forEach(file => filesToParse.add(file));
        
        // Limit files for performance (only parse most relevant)
        const sortedFiles = this.sortFilesByRelevance([...filesToParse], matches);
        const filesToProcess = sortedFiles.slice(0, 20); // Limit to 20 files
        
        // Parse files in parallel
        const parsePromises = filesToProcess.map(file => this.parseFile(file));
        const parseResults = await Promise.allSettled(parsePromises);
        
        // Process successful parses
        for (let i = 0; i < parseResults.length; i++) {
            const parseResult = parseResults[i];
            const file = filesToProcess[i];
            
            if (parseResult.status === 'fulfilled' && parseResult.value) {
                const { tree, language } = parseResult.value;
                result.files.push(file);
                
                // Extract information from AST
                await this.extractASTInformation(tree, language, file, result, matches);
            }
        }
        
        // Find design patterns
        result.patterns = this.findDesignPatterns(result.nodes);
        
        result.parseTime = Date.now() - startTime;
        return result;
    }
    
    private async parseFile(filePath: string): Promise<{ tree: Tree; language: string } | null> {
        try {
            // Check cache
            const cached = this.cache.get(filePath);
            if (cached) {
                const stats = await fs.stat(filePath);
                if (stats.mtime.getTime() < cached.timestamp) {
                    return { tree: cached.tree, language: this.getLanguageFromFile(filePath) };
                }
            }
            
            // Check file size
            const stats = await fs.stat(filePath);
            const maxSize = this.parseSize(this.config.maxFileSize);
            if (stats.size > maxSize) {
                console.warn(`File too large, skipping: ${filePath} (${stats.size} bytes)`);
                return null;
            }
            
            // Determine language and parser
            const language = this.getLanguageFromFile(filePath);
            const parser = this.parsers.get(language);
            
            if (!parser) {
                return null;
            }
            
            // Parse file
            const content = await fs.readFile(filePath, 'utf-8');
            const tree = parser.parse(content);
            
            // Cache result
            this.cache.set(filePath, {
                tree,
                timestamp: Date.now()
            });
            
            return { tree, language };
            
        } catch (error) {
            console.warn(`Failed to parse file: ${filePath}`, error);
            return null;
        }
    }
    
    private async extractASTInformation(
        tree: Tree,
        language: string,
        filePath: string,
        result: TreeSitterResult,
        originalMatches: EnhancedMatches
    ): Promise<void> {
        const queries = this.queries.get(language);
        if (!queries) return;
        
        // Extract all relevant nodes
        const allCaptures = new Map<string, any[]>();
        
        for (const [queryName, query] of queries) {
            try {
                const captures = query.captures(tree.rootNode);
                allCaptures.set(queryName, captures);
            } catch (error) {
                console.warn(`Query failed: ${queryName}`, error);
            }
        }
        
        // Process identifiers
        this.processIdentifiers(allCaptures.get('identifiers') || [], filePath, result, originalMatches);
        
        // Process functions
        this.processFunctions(allCaptures.get('functions') || [], filePath, result);
        
        // Process classes
        this.processClasses(allCaptures.get('classes') || [], filePath, result);
        
        // Process imports/exports
        this.processImportsExports(
            allCaptures.get('imports') || [],
            allCaptures.get('exports') || [],
            filePath,
            result
        );
        
        // Process relationships
        this.processRelationships(
            allCaptures.get('calls') || [],
            allCaptures.get('references') || [],
            filePath,
            result
        );
    }
    
    private processIdentifiers(
        captures: any[],
        filePath: string,
        result: TreeSitterResult,
        originalMatches: EnhancedMatches
    ): void {
        for (const capture of captures) {
            const node = capture.node;
            
            // Check if this identifier is relevant to our search
            const isRelevant = this.isNodeRelevant(node, originalMatches);
            
            if (isRelevant) {
                const astNode = this.createASTNode(node, filePath);
                result.nodes.push(astNode);
            }
        }
    }
    
    private processFunctions(captures: any[], filePath: string, result: TreeSitterResult): void {
        for (const capture of captures) {
            const node = capture.node;
            const astNode = this.createASTNode(node, filePath);
            
            // Extract function-specific metadata
            const functionName = this.findChildByType(node, 'identifier')?.text;
            const parameters = this.extractParameters(node);
            const returnType = this.extractReturnType(node);
            
            astNode.metadata = {
                ...astNode.metadata,
                functionName,
                parameters,
                returnType
            };
            
            result.nodes.push(astNode);
        }
    }
    
    private processClasses(captures: any[], filePath: string, result: TreeSitterResult): void {
        for (const capture of captures) {
            const node = capture.node;
            const astNode = this.createASTNode(node, filePath);
            
            // Extract class-specific metadata
            const className = this.findChildByType(node, 'type_identifier')?.text ||
                              this.findChildByType(node, 'identifier')?.text;
            
            const extendsClass = this.extractExtendsClause(node);
            const implementsInterfaces = this.extractImplementsClause(node);
            
            astNode.metadata = {
                ...astNode.metadata,
                className,
                extends: extendsClass,
                implements: implementsInterfaces
            };
            
            result.nodes.push(astNode);
        }
    }
    
    private processImportsExports(
        imports: any[],
        exports: any[],
        filePath: string,
        result: TreeSitterResult
    ): void {
        // Process imports
        for (const capture of imports) {
            const node = capture.node;
            const importInfo = this.extractImportInfo(node);
            
            if (importInfo) {
                // Create relationship
                result.relationships.push({
                    from: filePath,
                    to: importInfo.source,
                    type: 'imports',
                    confidence: 1.0,
                    location: `${filePath}:${node.startPosition.row + 1}`
                });
            }
        }
        
        // Process exports
        for (const capture of exports) {
            const node = capture.node;
            const exportInfo = this.extractExportInfo(node);
            
            if (exportInfo) {
                const astNode = this.createASTNode(node, filePath);
                astNode.metadata.exports = [exportInfo];
                result.nodes.push(astNode);
            }
        }
    }
    
    private processRelationships(
        calls: any[],
        references: any[],
        filePath: string,
        result: TreeSitterResult
    ): void {
        // Process function calls
        for (const capture of calls) {
            const node = capture.node;
            const callInfo = this.extractCallInfo(node);
            
            if (callInfo) {
                result.relationships.push({
                    from: filePath,
                    to: callInfo.target,
                    type: 'calls',
                    confidence: 0.9,
                    location: `${filePath}:${node.startPosition.row + 1}`
                });
            }
        }
        
        // Process references
        for (const capture of references) {
            const node = capture.node;
            const refInfo = this.extractReferenceInfo(node);
            
            if (refInfo) {
                result.relationships.push({
                    from: filePath,
                    to: refInfo.target,
                    type: 'references',
                    confidence: 0.8,
                    location: `${filePath}:${node.startPosition.row + 1}`
                });
            }
        }
    }
    
    private createASTNode(node: SyntaxNode, filePath: string): ASTNode {
        return {
            id: `${filePath}:${node.startPosition.row}:${node.startPosition.column}`,
            type: node.type,
            text: node.text,
            range: {
                start: {
                    line: node.startPosition.row,
                    character: node.startPosition.column
                },
                end: {
                    line: node.endPosition.row,
                    character: node.endPosition.column
                }
            },
            children: node.children.map(child => 
                `${filePath}:${child.startPosition.row}:${child.startPosition.column}`
            ),
            parent: node.parent ? 
                `${filePath}:${node.parent.startPosition.row}:${node.parent.startPosition.column}` :
                undefined,
            metadata: {}
        };
    }
    
    private isNodeRelevant(node: SyntaxNode, originalMatches: EnhancedMatches): boolean {
        const nodeText = node.text.toLowerCase();
        
        // Check if node text matches any of our search terms
        const allMatches = [...originalMatches.exact, ...originalMatches.fuzzy, ...originalMatches.conceptual];
        
        return allMatches.some(match => 
            nodeText.includes(match.text.toLowerCase()) ||
            match.text.toLowerCase().includes(nodeText)
        );
    }
    
    private findDesignPatterns(nodes: ASTNode[]): DesignPattern[] {
        const patterns: DesignPattern[] = [];
        
        // Factory pattern detection
        const factoryPattern = this.detectFactoryPattern(nodes);
        if (factoryPattern) {
            patterns.push(factoryPattern);
        }
        
        // Singleton pattern detection
        const singletonPattern = this.detectSingletonPattern(nodes);
        if (singletonPattern) {
            patterns.push(singletonPattern);
        }
        
        // Observer pattern detection
        const observerPattern = this.detectObserverPattern(nodes);
        if (observerPattern) {
            patterns.push(observerPattern);
        }
        
        return patterns;
    }
    
    private detectFactoryPattern(nodes: ASTNode[]): DesignPattern | null {
        // Look for functions that create and return new objects
        const factoryNodes = nodes.filter(node => {
            return node.type === 'function_declaration' &&
                   node.metadata.functionName &&
                   (node.metadata.functionName.toLowerCase().includes('create') ||
                    node.metadata.functionName.toLowerCase().includes('make') ||
                    node.metadata.functionName.toLowerCase().includes('factory')) &&
                   node.text.includes('new ') &&
                   node.text.includes('return');
        });
        
        if (factoryNodes.length > 0) {
            return {
                name: 'Factory',
                type: 'factory',
                confidence: 0.8,
                nodes: factoryNodes.map(n => n.id),
                description: 'Factory pattern detected: functions that create and return objects'
            };
        }
        
        return null;
    }
    
    private detectSingletonPattern(nodes: ASTNode[]): DesignPattern | null {
        // Look for classes with getInstance method and private constructor
        const classes = nodes.filter(node => node.type === 'class_declaration');
        
        for (const classNode of classes) {
            const hasGetInstance = nodes.some(node => 
                node.parent === classNode.id &&
                node.metadata.functionName === 'getInstance'
            );
            
            const hasPrivateConstructor = nodes.some(node =>
                node.parent === classNode.id &&
                node.type === 'method_definition' &&
                node.text.includes('private') &&
                node.text.includes('constructor')
            );
            
            if (hasGetInstance && hasPrivateConstructor) {
                return {
                    name: 'Singleton',
                    type: 'singleton',
                    confidence: 0.9,
                    nodes: [classNode.id],
                    description: 'Singleton pattern detected: class with getInstance method and private constructor'
                };
            }
        }
        
        return null;
    }
    
    private detectObserverPattern(nodes: ASTNode[]): DesignPattern | null {
        // Look for subscribe/unsubscribe methods and notify functionality
        const hasSubscribe = nodes.some(node => 
            node.metadata.functionName?.toLowerCase().includes('subscribe') ||
            node.metadata.functionName?.toLowerCase().includes('listen')
        );
        
        const hasUnsubscribe = nodes.some(node => 
            node.metadata.functionName?.toLowerCase().includes('unsubscribe') ||
            node.metadata.functionName?.toLowerCase().includes('remove')
        );
        
        const hasNotify = nodes.some(node => 
            node.metadata.functionName?.toLowerCase().includes('notify') ||
            node.metadata.functionName?.toLowerCase().includes('emit') ||
            node.metadata.functionName?.toLowerCase().includes('broadcast')
        );
        
        if (hasSubscribe && hasUnsubscribe && hasNotify) {
            const observerNodes = nodes.filter(node => 
                node.metadata.functionName &&
                (node.metadata.functionName.toLowerCase().includes('subscribe') ||
                 node.metadata.functionName.toLowerCase().includes('notify') ||
                 node.metadata.functionName.toLowerCase().includes('emit'))
            );
            
            return {
                name: 'Observer',
                type: 'observer',
                confidence: 0.8,
                nodes: observerNodes.map(n => n.id),
                description: 'Observer pattern detected: subscribe/notify functionality'
            };
        }
        
        return null;
    }
    
    // Utility methods
    private sortFilesByRelevance(files: string[], matches: EnhancedMatches): string[] {
        const fileScores = new Map<string, number>();
        
        // Score files based on match quality and quantity
        for (const file of files) {
            let score = 0;
            
            // Exact matches get highest score
            score += matches.exact.filter(m => m.file === file).length * 10;
            
            // Fuzzy matches get medium score
            score += matches.fuzzy.filter(m => m.file === file).length * 5;
            
            // Conceptual matches get lower score
            score += matches.conceptual.filter(m => m.file === file).length * 2;
            
            // Prefer certain file types
            if (file.endsWith('.ts') || file.endsWith('.tsx')) score += 2;
            if (file.endsWith('') || file.endsWith('.jsx')) score += 1;
            
            // Prefer non-test files
            if (!file.includes('test') && !file.includes('spec')) score += 1;
            
            fileScores.set(file, score);
        }
        
        return files.sort((a, b) => (fileScores.get(b) || 0) - (fileScores.get(a) || 0));
    }
    
    private getLanguageFromFile(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.ts':
            case '.tsx':
                return 'typescript';
            case '':
            case '.jsx':
                return 'javascript';
            case '.py':
                return 'python';
            default:
                return 'typescript'; // Default fallback
        }
    }
    
    private parseSize(sizeString: string): number {
        const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
        if (!match) return 1024 * 1024; // Default 1MB
        
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'B').toUpperCase();
        
        const multipliers: Record<string, number> = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024
        };
        
        return value * (multipliers[unit] || 1);
    }
    
    private findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
        for (const child of node.children) {
            if (child.type === type) {
                return child;
            }
        }
        return null;
    }
    
    private extractParameters(node: SyntaxNode): string[] {
        const params: string[] = [];
        const paramsNode = this.findChildByType(node, 'formal_parameters') || 
                          this.findChildByType(node, 'parameters');
        
        if (paramsNode) {
            for (const child of paramsNode.children) {
                if (child.type === 'required_parameter' || child.type === 'parameter') {
                    const paramName = this.findChildByType(child, 'identifier')?.text;
                    if (paramName) {
                        params.push(paramName);
                    }
                }
            }
        }
        
        return params;
    }
    
    private extractReturnType(node: SyntaxNode): string | undefined {
        const returnTypeNode = this.findChildByType(node, 'type_annotation');
        return returnTypeNode?.text.replace(/^:\s*/, '');
    }
    
    private extractExtendsClause(node: SyntaxNode): string | undefined {
        const heritageNode = this.findChildByType(node, 'class_heritage');
        if (heritageNode) {
            const extendsNode = this.findChildByType(heritageNode, 'extends_clause');
            if (extendsNode) {
                const identifierNode = this.findChildByType(extendsNode, 'identifier') ||
                                     this.findChildByType(extendsNode, 'type_identifier');
                return identifierNode?.text;
            }
        }
        return undefined;
    }
    
    private extractImplementsClause(node: SyntaxNode): string[] {
        const implementsList: string[] = [];
        const heritageNode = this.findChildByType(node, 'class_heritage');
        
        if (heritageNode) {
            const implementsNode = this.findChildByType(heritageNode, 'implements_clause');
            if (implementsNode) {
                for (const child of implementsNode.children) {
                    if (child.type === 'type_identifier') {
                        implementsList.push(child.text);
                    }
                }
            }
        }
        
        return implementsList;
    }
    
    private extractImportInfo(node: SyntaxNode): { source: string; specifiers: string[] } | null {
        const sourceNode = this.findChildByType(node, 'string');
        if (!sourceNode) return null;
        
        const source = sourceNode.text.replace(/['"]/g, '');
        const specifiers: string[] = [];
        
        // Extract import specifiers
        const importClause = this.findChildByType(node, 'import_clause');
        if (importClause) {
            for (const child of importClause.children) {
                if (child.type === 'identifier') {
                    specifiers.push(child.text);
                }
            }
        }
        
        return { source, specifiers };
    }
    
    private extractExportInfo(node: SyntaxNode): { name: string; type: 'default' | 'named' } | null {
        // This is a simplified implementation
        const nameNode = this.findChildByType(node, 'identifier') ||
                         this.findChildByType(node, 'type_identifier');
        
        if (!nameNode) return null;
        
        const isDefault = node.text.includes('export default');
        
        return {
            name: nameNode.text,
            type: isDefault ? 'default' : 'named'
        };
    }
    
    private extractCallInfo(node: SyntaxNode): { target: string } | null {
        const funcNode = this.findChildByType(node, 'identifier');
        if (funcNode) {
            return { target: funcNode.text };
        }
        
        // Handle member expressions (obj.method())
        const memberNode = this.findChildByType(node, 'member_expression');
        if (memberNode) {
            const objectNode = this.findChildByType(memberNode, 'identifier');
            const propertyNode = this.findChildByType(memberNode, 'property_identifier');
            
            if (objectNode && propertyNode) {
                return { target: `${objectNode.text}.${propertyNode.text}` };
            }
        }
        
        return null;
    }
    
    private extractReferenceInfo(node: SyntaxNode): { target: string } | null {
        const objectNode = this.findChildByType(node, 'identifier');
        const propertyNode = this.findChildByType(node, 'property_identifier');
        
        if (objectNode && propertyNode) {
            return { target: `${objectNode.text}.${propertyNode.text}` };
        } else if (objectNode) {
            return { target: objectNode.text };
        }
        
        return null;
    }
}