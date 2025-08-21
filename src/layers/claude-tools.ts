// Claude Tools Layer - Integration with Claude Code's native Grep, Glob, LS tools
import { 
    Layer, SearchQuery, EnhancedMatches, Match, SearchContext 
} from '../types/core.js';
import { 
    ClaudeGrepParams, ClaudeGlobParams, ClaudeLSParams,
    ClaudeGrepResult, ClaudeGlobResult, ClaudeLSResult,
    GrepSearchStrategy, SearchVariant, HybridSearchResult,
    ClaudeToolError, ClaudeToolsLayerConfig
} from '../types/claude-tools.js';
import * as path from 'path';

// Claude Code tools (correct capitalization)
declare const Grep: (params: ClaudeGrepParams) => Promise<ClaudeGrepResult[] | string[]>;
declare const Glob: (params: ClaudeGlobParams) => Promise<ClaudeGlobResult>;
declare const LS: (params: ClaudeLSParams) => Promise<ClaudeLSResult>;

export class ClaudeToolsLayer implements Layer<SearchQuery, EnhancedMatches> {
    name = 'ClaudeToolsLayer';
    timeout = 5000; // 5 second timeout
    
    private cache = new Map<string, { result: EnhancedMatches; timestamp: number }>();
    private bloomFilter = new Set<string>();
    private frequencyMap = new Map<string, number>();
    
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
    
    constructor(private config: ClaudeToolsLayerConfig) {}
    
    async process(query: SearchQuery): Promise<EnhancedMatches> {
        const startTime = Date.now();
        const cacheKey = this.getCacheKey(query);
        
        // Check cache first
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        
        // Check bloom filter for negative results
        if (this.config.optimization.bloomFilter && !this.bloomFilter.has(query.identifier)) {
            return {
                exact: [],
                fuzzy: [],
                conceptual: [],
                files: new Set(),
                searchTime: Date.now() - startTime
            };
        }
        
        const matches: EnhancedMatches = {
            exact: [],
            fuzzy: [],
            conceptual: [],
            files: new Set<string>(),
            searchTime: 0
        };
        
        try {
            // Run all search strategies in parallel
            await Promise.allSettled([
                this.searchWithGrep(query, matches),
                this.searchWithGlob(query, matches),
                this.analyzeWithLS(query, matches)
            ]);
            
            matches.searchTime = Date.now() - startTime;
            
            // Update caches and statistics
            this.updateCache(cacheKey, matches);
            this.updateStatistics(query, matches);
            
            return matches;
            
        } catch (error) {
            throw new ClaudeToolError(
                `Claude tools search failed: ${this.getErrorMessage(error)}`,
                'grep',
                query,
                error as Error
            );
        }
    }
    
    private async searchWithGrep(query: SearchQuery, matches: EnhancedMatches): Promise<void> {
        const strategies = this.generateGrepStrategies(query);
        
        // Execute strategies in parallel
        const results = await Promise.allSettled(
            strategies.map(strategy => this.executeGrepStrategy(strategy))
        );
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const strategy = strategies[i];
            
            if (result.status === 'fulfilled' && result.value.success) {
                const grepMatches = this.parseGrepResults(
                    result.value.matches,
                    strategy.confidence,
                    strategy.name
                );
                
                // Categorize matches based on strategy
                if (strategy.name.includes('exact')) {
                    matches.exact.push(...grepMatches);
                } else if (strategy.name.includes('fuzzy')) {
                    matches.fuzzy.push(...grepMatches);
                } else {
                    matches.conceptual.push(...grepMatches);
                }
                
                // Add files to the set
                grepMatches.forEach(match => matches.files.add(match.file));
            }
        }
    }
    
    private async searchWithGlob(query: SearchQuery, matches: EnhancedMatches): Promise<void> {
        const patterns = this.generateGlobPatterns(query);
        
        for (const pattern of patterns) {
            try {
                const files = await this.executeWithTimeout(
                    () => Glob({ pattern, path: query.searchPath }),
                    this.config.glob.defaultTimeout
                );
                
                files.forEach(file => matches.files.add(file));
                
                // Search within these files for the identifier
                await this.searchFilesForIdentifier(files, query, matches);
                
            } catch (error) {
                // Continue with next pattern
                console.warn(`Glob pattern failed: ${pattern}`, error);
            }
        }
    }
    
    private async analyzeWithLS(query: SearchQuery, matches: EnhancedMatches): Promise<void> {
        const relevantDirs = await this.findRelevantDirectories(query, matches);
        
        for (const dir of relevantDirs) {
            try {
                const entries = await this.executeWithTimeout(
                    () => LS({ 
                        path: dir, 
                        ignore: this.config.ls.includeDotfiles ? [] : this.config.glob.ignorePatterns 
                    }),
                    this.config.ls.defaultTimeout
                );
                
                // Find co-located files
                const colocated = this.findColocatedFiles(entries, query);
                colocated.forEach(file => matches.files.add(file));
                
                // Search co-located files
                await this.searchFilesForIdentifier(colocated, query, matches);
                
            } catch (error) {
                console.warn(`LS analysis failed for directory: ${dir}`, error);
            }
        }
    }
    
    private generateGrepStrategies(query: SearchQuery): GrepSearchStrategy[] {
        const strategies: GrepSearchStrategy[] = [];
        
        // Exact match strategy
        strategies.push({
            name: 'exact_match',
            params: {
                pattern: `\\b${this.escapeRegex(query.identifier)}\\b`,
                output_mode: 'content',
                '-n': true,
                '-C': this.config.grep.contextLines,
                type: this.getFileTypeForGrep(query.fileTypes),
                head_limit: this.config.grep.maxResults
            },
            confidence: 1.0
        });
        
        // Case insensitive strategy
        strategies.push({
            name: 'case_insensitive',
            params: {
                pattern: `\\b${this.escapeRegex(query.identifier)}\\b`,
                output_mode: 'content',
                '-i': true,
                '-n': true,
                type: this.getFileTypeForGrep(query.fileTypes),
                head_limit: this.config.grep.maxResults
            },
            confidence: 0.9
        });
        
        // Fuzzy token matching
        const tokens = this.tokenize(query.identifier);
        if (tokens.length > 1) {
            strategies.push({
                name: 'fuzzy_tokens',
                params: {
                    pattern: tokens.join('.*'),
                    output_mode: 'content',
                    '-i': true,
                    '-n': true,
                    type: this.getFileTypeForGrep(query.fileTypes),
                    head_limit: Math.floor(this.config.grep.maxResults / 2)
                },
                confidence: 0.7
            });
        }
        
        // Semantic variants
        const variants = this.generateSemanticVariants(query.identifier);
        for (const variant of variants) {
            strategies.push({
                name: `semantic_${variant.strategy}`,
                params: {
                    pattern: variant.pattern,
                    output_mode: 'files_with_matches',
                    '-i': true,
                    type: this.getFileTypeForGrep(query.fileTypes),
                    head_limit: 50
                },
                confidence: variant.confidence
            });
        }
        
        return strategies;
    }
    
    private async executeGrepStrategy(strategy: GrepSearchStrategy) {
        try {
            const results = await this.executeWithTimeout(
                () => Grep(strategy.params),
                strategy.timeout || this.config.grep.defaultTimeout
            );
            
            return {
                strategy,
                matches: Array.isArray(results) ? results as ClaudeGrepResult[] : [],
                searchTime: Date.now(),
                success: true
            };
            
        } catch (error) {
            return {
                strategy,
                matches: [],
                searchTime: Date.now(),
                success: false,
                error: this.getErrorMessage(error)
            };
        }
    }
    
    private generateGlobPatterns(query: SearchQuery): string[] {
        const patterns: string[] = [];
        const identifier = query.identifier;
        const tokens = this.tokenize(identifier);
        
        // File name patterns
        patterns.push(
            `**/*${identifier}*.{ts,tsx,js,jsx,py,java,go,rs}`,
            `**/${identifier}.{ts,tsx,js,jsx,py,java,go,rs}`,
            `**/${identifier}/**/*.{ts,tsx,js,jsx,py,java,go,rs}`
        );
        
        // Common directory patterns
        if (tokens.length > 0) {
            const mainToken = tokens[tokens.length - 1].toLowerCase();
            patterns.push(
                `**/services/*${mainToken}*.{ts,js,py}`,
                `**/controllers/*${mainToken}*.{ts,js,py}`,
                `**/models/*${mainToken}*.{ts,js,py}`,
                `**/components/*${mainToken}*.{tsx,jsx}`,
                `**/${mainToken}/**/*.{ts,tsx,js,jsx,py}`
            );
        }
        
        // Test file patterns
        if (query.includeTests) {
            patterns.push(
                `**/*${identifier}*.test.{ts,js}`,
                `**/*${identifier}*.spec.{ts,js}`,
                `**/__tests__/**/*${identifier}*.{ts,js}`
            );
        }
        
        return patterns;
    }
    
    private async findRelevantDirectories(
        query: SearchQuery, 
        matches: EnhancedMatches
    ): Promise<string[]> {
        const dirs = new Set<string>();
        
        // Add directories from existing matches
        for (const match of [...matches.exact, ...matches.fuzzy, ...matches.conceptual]) {
            dirs.add(path.dirname(match.file));
        }
        
        // Add directories from files
        for (const file of matches.files) {
            dirs.add(path.dirname(file));
        }
        
        // Add common project directories
        const commonDirs = [
            'src',
            'src/components',
            'src/services',
            'src/utils',
            'src/models',
            'src/controllers',
            'lib',
            'app'
        ];
        
        for (const dir of commonDirs) {
            try {
                await LS({ path: dir });
                dirs.add(dir);
            } catch {
                // Directory doesn't exist, skip
            }
        }
        
        return Array.from(dirs);
    }
    
    private findColocatedFiles(entries: ClaudeLSResult, query: SearchQuery): string[] {
        const colocated: string[] = [];
        const tokens = this.tokenize(query.identifier);
        
        for (const entry of entries) {
            if (entry.type === 'file') {
                const fileName = path.basename(entry.name, path.extname(entry.name));
                const fileTokens = this.tokenize(fileName);
                
                // Check token overlap
                const overlap = this.calculateTokenOverlap(tokens, fileTokens);
                if (overlap > 0.3) {
                    colocated.push(entry.path);
                }
                
                // Check common naming patterns
                if (this.matchesNamingPattern(query.identifier, fileName)) {
                    colocated.push(entry.path);
                }
            }
        }
        
        return colocated;
    }
    
    private async searchFilesForIdentifier(
        files: string[],
        query: SearchQuery,
        matches: EnhancedMatches
    ): Promise<void> {
        const searchPromises = files.slice(0, 20).map(async file => { // Limit to 20 files for performance
            try {
                const results = await Grep({
                    pattern: query.identifier,
                    path: file,
                    output_mode: 'content',
                    '-i': !query.caseSensitive,
                    '-n': true
                });
                
                if (Array.isArray(results)) {
                    const fileMatches = this.parseGrepResults(results as ClaudeGrepResult[], 0.6, 'file_search');
                    matches.conceptual.push(...fileMatches);
                }
                
            } catch (error) {
                // File search failed, continue
            }
        });
        
        await Promise.allSettled(searchPromises);
    }
    
    private parseGrepResults(
        results: ClaudeGrepResult[],
        baseConfidence: number,
        source: string
    ): Match[] {
        const matches: Match[] = [];
        
        for (const result of results) {
            if (result.file && result.line && result.text) {
                matches.push({
                    file: result.file,
                    line: result.line,
                    column: result.column || 0,
                    text: result.match || result.text,
                    length: (result.match || result.text).length,
                    confidence: baseConfidence,
                    source: source as any,
                    context: result.context ? 
                        [...(result.context.before || []), ...(result.context.after || [])].join('\n') :
                        undefined
                });
            }
        }
        
        return matches;
    }
    
    private generateSemanticVariants(identifier: string): SearchVariant[] {
        const variants: SearchVariant[] = [];
        
        // Common verb synonyms
        const synonyms = {
            get: ['fetch', 'retrieve', 'load', 'obtain', 'find'],
            set: ['update', 'modify', 'change', 'assign', 'put'],
            create: ['make', 'build', 'generate', 'produce', 'new'],
            delete: ['remove', 'destroy', 'eliminate', 'clear']
        };
        
        // Apply synonyms
        for (const [verb, alternatives] of Object.entries(synonyms)) {
            if (identifier.toLowerCase().startsWith(verb)) {
                for (const alt of alternatives) {
                    const variant = identifier.replace(new RegExp(`^${verb}`, 'i'), alt);
                    variants.push({
                        pattern: `\\b${variant}\\b`,
                        confidence: 0.8,
                        strategy: 'semantic'
                    });
                }
            }
        }
        
        // Case variations
        variants.push(
            {
                pattern: this.toSnakeCase(identifier),
                confidence: 0.7,
                strategy: 'pattern'
            },
            {
                pattern: this.toPascalCase(identifier),
                confidence: 0.7,
                strategy: 'pattern'
            },
            {
                pattern: this.toKebabCase(identifier),
                confidence: 0.6,
                strategy: 'pattern'
            }
        );
        
        // Plural/singular variants
        if (identifier.endsWith('s')) {
            variants.push({
                pattern: identifier.slice(0, -1),
                confidence: 0.8,
                strategy: 'pattern'
            });
        } else {
            variants.push({
                pattern: identifier + 's',
                confidence: 0.8,
                strategy: 'pattern'
            });
        }
        
        return variants;
    }
    
    // Utility methods
    private tokenize(identifier: string): string[] {
        return identifier
            .split(/(?=[A-Z])|_|-/)
            .map(s => s.toLowerCase())
            .filter(s => s.length > 0);
    }
    
    private calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }
    
    private matchesNamingPattern(identifier: string, fileName: string): boolean {
        const identTokens = this.tokenize(identifier);
        const fileTokens = this.tokenize(fileName);
        
        // Check if file contains main concepts from identifier
        return identTokens.some(token => 
            fileTokens.some(fileToken => 
                fileToken.includes(token) || token.includes(fileToken)
            )
        );
    }
    
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    private getFileTypeForGrep(fileTypes?: string[]): string {
        if (!fileTypes || fileTypes.length === 0) {
            return 'ts'; // Default to TypeScript
        }
        return fileTypes[0];
    }
    
    private toSnakeCase(str: string): string {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }
    
    private toPascalCase(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    private toKebabCase(str: string): string {
        return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    }
    
    private getCacheKey(query: SearchQuery): string {
        return `${query.identifier}:${query.searchPath || ''}:${query.fileTypes?.join(',') || ''}`;
    }
    
    private getFromCache(key: string): EnhancedMatches | null {
        if (!this.config.caching.enabled) return null;
        
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > this.config.caching.ttl * 1000) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.result;
    }
    
    private updateCache(key: string, result: EnhancedMatches): void {
        if (!this.config.caching.enabled) return;
        
        if (this.cache.size >= this.config.caching.maxEntries) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        
        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });
    }
    
    private updateStatistics(query: SearchQuery, matches: EnhancedMatches): void {
        // Update frequency map
        const freq = this.frequencyMap.get(query.identifier) || 0;
        this.frequencyMap.set(query.identifier, freq + 1);
        
        // Update bloom filter
        if (matches.exact.length > 0 || matches.fuzzy.length > 0) {
            this.bloomFilter.add(query.identifier);
        }
    }
    
    private async executeWithTimeout<T>(
        fn: () => Promise<T>,
        timeout: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeout}ms`));
            }, timeout);
            
            fn().then(
                result => {
                    clearTimeout(timer);
                    resolve(result);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }
}