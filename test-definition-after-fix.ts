#!/usr/bin/env bun

import { CodeAnalyzer } from './src/core/unified-analyzer';

async function testFindDefinition() {
    console.log("🧪 Testing find_definition after bloom filter fix...\n");
    
    const analyzer = new CodeAnalyzer();
    await analyzer.initialize();
    
    const testSymbols = [
        'AsyncEnhancedGrep',
        'UnifiedAnalyzer', 
        'ClaudeToolsLayer',
        'TreeSitterLayer'
    ];
    
    for (const symbol of testSymbols) {
        console.log(`\n🔍 Searching for: ${symbol}`);
        console.time(`  ⏱️  Time`);
        
        const result = await analyzer.findDefinition({
            identifier: symbol,
            type: 'definition' 
        });
        
        console.timeEnd(`  ⏱️  Time`);
        
        if (result.exact.length > 0) {
            console.log(`  ✅ Found ${result.exact.length} definition(s):`);
            for (const match of result.exact.slice(0, 3)) {
                console.log(`     - ${match.file}:${match.line}`);
                if (match.text) {
                    const preview = match.text.trim().substring(0, 80);
                    console.log(`       "${preview}..."`);
                }
            }
        } else {
            console.log(`  ❌ No definitions found`);
        }
    }
    
    console.log("\n✅ Test complete!");
}

testFindDefinition().catch(console.error);