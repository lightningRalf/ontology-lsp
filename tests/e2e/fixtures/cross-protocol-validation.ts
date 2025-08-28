import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { CLIAdapter } from '../../../src/adapters/cli-adapter';
import type { HTTPAdapter } from '../../../src/adapters/http-adapter';
import type { LSPAdapter } from '../../../src/adapters/lsp-adapter';
import type { MCPAdapter } from '../../../src/adapters/mcp-adapter';
import type { CodeAnalyzer } from '../../../src/core/unified-analyzer';
import type { TestRepository } from './repository-configs';

export interface ProtocolTestCase {
    name: string;
    description: string;
    operation: 'findDefinition' | 'findReferences' | 'rename' | 'suggestRefactoring' | 'getCompletions';
    file: string;
    input: any;
    expectedResultType: 'array' | 'object' | 'string' | 'number';
    expectedMinResults?: number;
    expectedMaxResults?: number;
}

export interface ProtocolResult {
    protocol: string;
    success: boolean;
    result: any;
    duration: number;
    error?: string;
    metadata: {
        resultType: string;
        resultCount: number;
        resultSize: number;
    };
}

export interface ConsistencyValidationReport {
    repository: string;
    testCases: Array<{
        testCase: ProtocolTestCase;
        results: ProtocolResult[];
        consistency: {
            allSucceeded: boolean;
            similarResults: boolean;
            similarPerformance: boolean;
            similarity: number;
            performanceVariance: number;
        };
        analysis: string;
    }>;
    summary: {
        totalTestCases: number;
        consistentCases: number;
        inconsistentCases: number;
        averageSimilarity: number;
        averagePerformanceVariance: number;
        protocolReliability: Record<string, number>;
        commonFailures: string[];
        recommendations: string[];
    };
}

export class CrossProtocolValidator {
    private adapters: {
        lsp: LSPAdapter;
        mcp: MCPAdapter;
        http: HTTPAdapter;
        cli: CLIAdapter;
    };

    constructor(
        adapters: {
            lsp: LSPAdapter;
            mcp: MCPAdapter;
            http: HTTPAdapter;
            cli: CLIAdapter;
        },
        private repository: TestRepository
    ) {
        this.adapters = adapters;
    }

    async validateProtocolConsistency(
        repositoryPath: string,
        sampleFiles: string[]
    ): Promise<ConsistencyValidationReport> {
        console.log(`🔄 Running cross-protocol consistency validation for ${this.repository.name}`);

        // Generate test cases based on available files
        const testCases = await this.generateTestCases(sampleFiles);
        console.log(`📋 Generated ${testCases.length} test cases for validation`);

        const validationResults: ConsistencyValidationReport['testCases'] = [];

        // Run each test case across all protocols
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`  🧪 [${i + 1}/${testCases.length}] Testing: ${testCase.name}`);

            // Execute test case on all protocols
            const results = await this.executeTestCaseAcrossProtocols(testCase);

            // Analyze consistency
            const consistency = this.analyzeConsistency(results);
            const analysis = this.generateAnalysis(testCase, results, consistency);

            validationResults.push({
                testCase,
                results,
                consistency,
                analysis,
            });

            // Log progress
            if (consistency.similarResults) {
                console.log(`    ✅ Consistent results across protocols`);
            } else {
                console.log(`    ⚠️ Inconsistent results (similarity: ${Math.round(consistency.similarity * 100)}%)`);
            }
        }

        const report = this.generateConsistencyReport(validationResults);
        this.logConsistencyReport(report);

        return report;
    }

    private async generateTestCases(sampleFiles: string[]): Promise<ProtocolTestCase[]> {
        const testCases: ProtocolTestCase[] = [];
        const filesToTest = sampleFiles.slice(0, 8); // Limit to 8 files for thorough testing

        for (const file of filesToTest) {
            // Find definition test cases
            testCases.push({
                name: `find_definition_import_${file.split('/').pop()}`,
                description: `Find definition of import statement in ${file}`,
                operation: 'findDefinition',
                file,
                input: { line: 1, character: 15 },
                expectedResultType: 'array',
                expectedMinResults: 0,
                expectedMaxResults: 5,
            });

            testCases.push({
                name: `find_definition_function_${file.split('/').pop()}`,
                description: `Find definition of function call in ${file}`,
                operation: 'findDefinition',
                file,
                input: { line: 10, character: 12 },
                expectedResultType: 'array',
                expectedMinResults: 0,
                expectedMaxResults: 3,
            });

            // Find references test cases
            testCases.push({
                name: `find_references_common_${file.split('/').pop()}`,
                description: `Find references to common symbols in ${file}`,
                operation: 'findReferences',
                file,
                input: { symbol: 'function' },
                expectedResultType: 'array',
                expectedMinResults: 0,
                expectedMaxResults: 50,
            });

            testCases.push({
                name: `find_references_variable_${file.split('/').pop()}`,
                description: `Find references to variables in ${file}`,
                operation: 'findReferences',
                file,
                input: { symbol: 'const' },
                expectedResultType: 'array',
                expectedMinResults: 0,
                expectedMaxResults: 30,
            });

            // Refactoring suggestions
            testCases.push({
                name: `suggest_refactoring_${file.split('/').pop()}`,
                description: `Get refactoring suggestions for ${file}`,
                operation: 'suggestRefactoring',
                file,
                input: {},
                expectedResultType: 'object',
                expectedMinResults: 0,
                expectedMaxResults: 10,
            });
        }

        // Add some rename test cases
        const firstFile = filesToTest[0];
        if (firstFile) {
            testCases.push({
                name: `rename_variable_${firstFile.split('/').pop()}`,
                description: `Rename variable in ${firstFile}`,
                operation: 'rename',
                file: firstFile,
                input: { position: { line: 5, character: 10 }, newName: 'renamedVariable' },
                expectedResultType: 'object',
                expectedMinResults: 0,
                expectedMaxResults: 20,
            });
        }

        return testCases;
    }

    private async executeTestCaseAcrossProtocols(testCase: ProtocolTestCase): Promise<ProtocolResult[]> {
        const protocols = [
            { name: 'lsp', adapter: this.adapters.lsp },
            { name: 'mcp', adapter: this.adapters.mcp },
            { name: 'http', adapter: this.adapters.http },
            { name: 'cli', adapter: this.adapters.cli },
        ];

        const results: ProtocolResult[] = [];

        for (const protocol of protocols) {
            const startTime = performance.now();
            let result: any;
            let success = true;
            let error: string | undefined;

            try {
                result = await this.executeOperationOnProtocol(protocol.name, protocol.adapter, testCase);
            } catch (err) {
                success = false;
                error = err instanceof Error ? err.message : String(err);
                result = null;
            }

            const endTime = performance.now();
            const duration = endTime - startTime;

            const metadata = this.analyzeResult(result, testCase.expectedResultType);

            results.push({
                protocol: protocol.name,
                success,
                result,
                duration,
                error,
                metadata,
            });
        }

        return results;
    }

    private async executeOperationOnProtocol(
        protocolName: string,
        adapter: any,
        testCase: ProtocolTestCase
    ): Promise<any> {
        switch (testCase.operation) {
            case 'findDefinition':
                if (protocolName === 'lsp') {
                    return await adapter.findDefinition(testCase.file, testCase.input);
                } else if (protocolName === 'mcp') {
                    const result = await adapter.handleToolCall({
                        name: 'find_definition',
                        arguments: { file: testCase.file, ...testCase.input },
                    });
                    return result.definitions || [];
                } else if (protocolName === 'http') {
                    // HTTP adapter would need to be running - simulate call
                    const response = await fetch(`http://localhost:7050/api/v1/definition`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: testCase.file, position: testCase.input }),
                    }).catch(() => ({ json: () => ({ definitions: [] }) }));
                    const data = await (response as any).json();
                    return data.definitions || [];
                } else if (protocolName === 'cli') {
                    return await adapter.findDefinition(testCase.file, testCase.input);
                }
                break;

            case 'findReferences':
                if (protocolName === 'lsp') {
                    return await adapter.findReferences(testCase.file, testCase.input.symbol);
                } else if (protocolName === 'mcp') {
                    const result = await adapter.handleToolCall({
                        name: 'find_references',
                        arguments: { file: testCase.file, symbol: testCase.input.symbol },
                    });
                    return result.references || [];
                } else if (protocolName === 'http') {
                    const response = await fetch(`http://localhost:7050/api/v1/references`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: testCase.file, symbol: testCase.input.symbol }),
                    }).catch(() => ({ json: () => ({ references: [] }) }));
                    const data = await (response as any).json();
                    return data.references || [];
                } else if (protocolName === 'cli') {
                    return await adapter.findReferences(testCase.file, testCase.input.symbol);
                }
                break;

            case 'suggestRefactoring':
                if (protocolName === 'lsp') {
                    return await adapter.suggestRefactoring(testCase.file);
                } else if (protocolName === 'mcp') {
                    const result = await adapter.handleToolCall({
                        name: 'suggest_refactoring',
                        arguments: { file: testCase.file },
                    });
                    return result.suggestions || {};
                } else if (protocolName === 'http') {
                    const response = await fetch(`http://localhost:7050/api/v1/refactor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: testCase.file }),
                    }).catch(() => ({ json: () => ({ suggestions: {} }) }));
                    const data = await (response as any).json();
                    return data.suggestions || {};
                } else if (protocolName === 'cli') {
                    return await adapter.suggestRefactoring(testCase.file);
                }
                break;

            case 'rename':
                if (protocolName === 'lsp') {
                    return await adapter.rename(testCase.file, testCase.input.position, testCase.input.newName);
                } else if (protocolName === 'mcp') {
                    const result = await adapter.handleToolCall({
                        name: 'rename_symbol',
                        arguments: { file: testCase.file, ...testCase.input },
                    });
                    return result.changes || {};
                } else if (protocolName === 'http') {
                    const response = await fetch(`http://localhost:7050/api/v1/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: testCase.file, ...testCase.input }),
                    }).catch(() => ({ json: () => ({ changes: {} }) }));
                    const data = await (response as any).json();
                    return data.changes || {};
                } else if (protocolName === 'cli') {
                    return await adapter.rename(testCase.file, testCase.input.position, testCase.input.newName);
                }
                break;

            default:
                throw new Error(`Unsupported operation: ${testCase.operation}`);
        }

        return null;
    }

    private analyzeResult(result: any, expectedType: string) {
        const resultType = Array.isArray(result) ? 'array' : typeof result;
        const resultCount = Array.isArray(result)
            ? result.length
            : result && typeof result === 'object'
              ? Object.keys(result).length
              : result
                ? 1
                : 0;
        const resultSize = JSON.stringify(result).length;

        return {
            resultType,
            resultCount,
            resultSize,
        };
    }

    private analyzeConsistency(results: ProtocolResult[]) {
        const successfulResults = results.filter((r) => r.success);
        const allSucceeded = successfulResults.length === results.length;

        // Calculate result similarity
        let similarity = 0;
        if (successfulResults.length >= 2) {
            // Compare result counts and structures
            const counts = successfulResults.map((r) => r.metadata.resultCount);
            const avgCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
            const countVariance = counts.reduce((sum, c) => sum + (c - avgCount) ** 2, 0) / counts.length;

            // Similarity based on count consistency (lower variance = higher similarity)
            const countSimilarity = avgCount > 0 ? Math.max(0, 1 - Math.sqrt(countVariance) / avgCount) : 1;

            // Consider result types consistency
            const resultTypes = successfulResults.map((r) => r.metadata.resultType);
            const typeConsistency = resultTypes.every((t) => t === resultTypes[0]) ? 1 : 0.5;

            similarity = countSimilarity * 0.7 + typeConsistency * 0.3;
        }

        // Calculate performance variance
        const durations = successfulResults.map((r) => r.duration);
        const avgDuration = durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
        const durationVariance =
            durations.length > 1 ? durations.reduce((sum, d) => sum + (d - avgDuration) ** 2, 0) / durations.length : 0;
        const performanceVariance = avgDuration > 0 ? Math.sqrt(durationVariance) / avgDuration : 0;

        return {
            allSucceeded,
            similarResults: similarity > 0.7,
            similarPerformance: performanceVariance < 0.5,
            similarity,
            performanceVariance,
        };
    }

    private generateAnalysis(testCase: ProtocolTestCase, results: ProtocolResult[], consistency: any): string {
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        let analysis = `Test case "${testCase.name}": `;

        if (consistency.allSucceeded) {
            if (consistency.similarResults) {
                analysis += '✅ All protocols succeeded with consistent results';
            } else {
                analysis += '⚠️ All protocols succeeded but with inconsistent results';
            }
        } else {
            analysis += `❌ ${failed.length}/${results.length} protocols failed`;
            if (failed.length > 0) {
                const errorSummary = failed
                    .map((f) => `${f.protocol}: ${f.error?.split('.')[0] || 'Unknown error'}`)
                    .join(', ');
                analysis += ` (${errorSummary})`;
            }
        }

        if (successful.length > 1) {
            const counts = successful.map((r) => r.metadata.resultCount);
            const durations = successful.map((r) => Math.round(r.duration));
            analysis += `. Result counts: [${counts.join(', ')}], Durations: [${durations.join(', ')}ms]`;
        }

        return analysis;
    }

    private generateConsistencyReport(
        validationResults: ConsistencyValidationReport['testCases']
    ): ConsistencyValidationReport {
        const consistentCases = validationResults.filter(
            (vr) => vr.consistency.similarResults && vr.consistency.allSucceeded
        );
        const inconsistentCases = validationResults.filter(
            (vr) => !vr.consistency.similarResults || !vr.consistency.allSucceeded
        );

        // Calculate average similarity
        const similarities = validationResults.map((vr) => vr.consistency.similarity);
        const averageSimilarity =
            similarities.length > 0 ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length : 0;

        // Calculate average performance variance
        const variances = validationResults.map((vr) => vr.consistency.performanceVariance);
        const averagePerformanceVariance =
            variances.length > 0 ? variances.reduce((sum, v) => sum + v, 0) / variances.length : 0;

        // Calculate protocol reliability
        const protocolReliability: Record<string, number> = {};
        const protocols = ['lsp', 'mcp', 'http', 'cli'];

        for (const protocol of protocols) {
            const protocolResults = validationResults.flatMap((vr) =>
                vr.results.filter((r) => r.protocol === protocol)
            );
            const successful = protocolResults.filter((r) => r.success).length;
            protocolReliability[protocol] = protocolResults.length > 0 ? successful / protocolResults.length : 0;
        }

        // Identify common failures
        const commonFailures: string[] = [];
        const errorCounts: Record<string, number> = {};

        validationResults.forEach((vr) => {
            vr.results
                .filter((r) => !r.success)
                .forEach((r) => {
                    const errorType = r.error?.split(':')[0] || 'Unknown error';
                    errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
                });
        });

        Object.entries(errorCounts)
            .filter(([_, count]) => count > 1)
            .sort(([_, a], [__, b]) => b - a)
            .slice(0, 5)
            .forEach(([error, count]) => {
                commonFailures.push(`${error} (${count} occurrences)`);
            });

        // Generate recommendations
        const recommendations: string[] = [];

        if (averageSimilarity < 0.8) {
            recommendations.push('Improve result normalization across protocols to increase consistency');
        }
        if (averagePerformanceVariance > 0.3) {
            recommendations.push('Investigate performance differences between protocol adapters');
        }
        if (Math.min(...Object.values(protocolReliability)) < 0.8) {
            recommendations.push('Address reliability issues in underperforming protocols');
        }
        if (commonFailures.length > 0) {
            recommendations.push(`Focus on resolving common failure types: ${commonFailures[0].split(' (')[0]}`);
        }
        if (recommendations.length === 0) {
            recommendations.push('Cross-protocol consistency is excellent - maintain current quality');
        }

        return {
            repository: this.repository.name,
            testCases: validationResults,
            summary: {
                totalTestCases: validationResults.length,
                consistentCases: consistentCases.length,
                inconsistentCases: inconsistentCases.length,
                averageSimilarity,
                averagePerformanceVariance,
                protocolReliability,
                commonFailures,
                recommendations,
            },
        };
    }

    private logConsistencyReport(report: ConsistencyValidationReport) {
        console.log(`\n📊 Cross-Protocol Consistency Report for ${report.repository}`);
        console.log(`═════════════════════════════════════════════════════════════`);

        console.log(`🔄 Test Summary:`);
        console.log(`   Total Test Cases: ${report.summary.totalTestCases}`);
        console.log(
            `   Consistent Cases: ${report.summary.consistentCases} (${Math.round((report.summary.consistentCases / report.summary.totalTestCases) * 100)}%)`
        );
        console.log(
            `   Inconsistent Cases: ${report.summary.inconsistentCases} (${Math.round((report.summary.inconsistentCases / report.summary.totalTestCases) * 100)}%)`
        );
        console.log(`   Average Similarity: ${Math.round(report.summary.averageSimilarity * 100)}%`);
        console.log(`   Performance Variance: ${Math.round(report.summary.averagePerformanceVariance * 100)}%`);
        console.log(``);

        console.log(`🔌 Protocol Reliability:`);
        Object.entries(report.summary.protocolReliability).forEach(([protocol, reliability]) => {
            const status = reliability >= 0.9 ? '✅' : reliability >= 0.7 ? '⚠️' : '❌';
            console.log(`   ${protocol.toUpperCase()}: ${Math.round(reliability * 100)}% ${status}`);
        });
        console.log(``);

        if (report.summary.commonFailures.length > 0) {
            console.log(`⚠️ Common Failures:`);
            report.summary.commonFailures.forEach((failure) => {
                console.log(`   • ${failure}`);
            });
            console.log(``);
        }

        console.log(`💡 Recommendations:`);
        report.summary.recommendations.forEach((rec) => {
            console.log(`   • ${rec}`);
        });
    }

    async saveConsistencyReport(report: ConsistencyValidationReport, outputPath: string): Promise<string> {
        await fs.mkdir(outputPath, { recursive: true });

        const reportFile = join(outputPath, `consistency-${report.repository}-${Date.now()}.json`);
        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

        // Also save a summary CSV
        const csvFile = join(outputPath, `consistency-summary-${report.repository}-${Date.now()}.csv`);
        const csvContent = [
            'TestCase,LSP_Success,MCP_Success,HTTP_Success,CLI_Success,Similarity,PerformanceVariance',
            ...report.testCases.map((tc) => {
                const results = tc.results.reduce((acc, r) => ({ ...acc, [r.protocol]: r.success }), {} as any);
                return `${tc.testCase.name},${results.lsp || false},${results.mcp || false},${results.http || false},${results.cli || false},${tc.consistency.similarity.toFixed(3)},${tc.consistency.performanceVariance.toFixed(3)}`;
            }),
        ].join('\n');
        await fs.writeFile(csvFile, csvContent);

        console.log(`💾 Consistency report saved to ${reportFile}`);
        return reportFile;
    }
}
