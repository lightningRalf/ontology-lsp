#!/usr/bin/env bun

import { CodeAnalyzer } from './src/core/unified-analyzer.js';
import { createDefaultCoreConfig } from './src/adapters/utils.js';

async function debugLayer1Search() {
    console.log("🔍 Debugging Layer 1 search for AsyncEnhancedGrep class definition");
    
    const config = createDefaultCoreConfig();
    const analyzer = new CodeAnalyzer(config);
    await analyzer.initialize();
    
    console.log("\n📍 Testing with NO URI (should search entire workspace):");
    const result1 = await analyzer.findDefinition({
        identifier: 'AsyncEnhancedGrep',
        uri: '',  // Empty URI should search everywhere
        position: { line: 0, character: 0 }
    });
    
    console.log(`Found ${result1.definitions.length} definitions`);
    
    // Look for the actual class definition
    const classDefinition = result1.definitions.find(d => 
        d.uri.includes('enhanced-search-tools-async.ts') && 
        d.uri.includes('src/layers/')
    );
    
    if (classDefinition) {
        console.log("✅ Found class definition in src/layers/enhanced-search-tools-async.ts");
        console.log(`   Line: ${classDefinition.range.start.line + 1}`);
        console.log(`   Kind: ${classDefinition.kind}`);
        console.log(`   Source: ${classDefinition.source}`);
        console.log(`   Layer: ${classDefinition.layer}`);
    } else {
        console.log("❌ Class definition NOT found in src/layers/enhanced-search-tools-async.ts");
        console.log("\n📋 All found locations:");
        result1.definitions.forEach((d, i) => {
            const file = d.uri.replace('file://', '').replace(process.cwd(), '.');
            console.log(`   ${i + 1}. ${file}:${d.range.start.line + 1}`);
        });
    }
    
    console.log("\n⏱️ Performance breakdown:");
    console.log(`   Layer 1: ${result1.performance.layer1}ms`);
    console.log(`   Layer 2: ${result1.performance.layer2}ms`);
    console.log(`   Layer 3: ${result1.performance.layer3}ms`);
    
    await analyzer.dispose();
}

debugLayer1Search().catch(console.error);