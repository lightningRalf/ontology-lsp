#!/usr/bin/env bun

/**
 * Test script to verify Layer 3 ontology implementation
 * This will populate the database with test concepts and then test if Layer 3 can find them
 */

import { CodeAnalyzer } from './src/core/unified-analyzer.js';
import { LayerManager } from './src/core/layer-manager.js';
import { SharedServices } from './src/core/services/shared-services.js';
import { EventBusService } from './src/core/services/event-bus-service.js';
import { CoreConfig, FindDefinitionRequest } from './src/core/types.js';
import * as path from 'path';
import * as fs from 'fs';

async function testLayer3Implementation() {
  const testDbPath = path.join(process.cwd(), '.test-ontology', 'test-layer3.db');
  
  // Clean up any existing test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  const testConfig: CoreConfig = {
    layers: {
      layer1: { enabled: true, timeout: 1000 },
      layer2: { enabled: true, timeout: 1000 },
      layer3: { enabled: true, timeout: 1000, dbPath: testDbPath },
      layer4: { enabled: true, timeout: 1000 },
      layer5: { enabled: true, timeout: 1000 }
    },
    cache: {
      enabled: true,
      strategy: 'memory' as const,
      memory: {
        maxSize: 1024 * 1024, // 1MB
        ttl: 300 // 5 minutes
      }
    },
    monitoring: {
      enabled: false
    },
    performance: {
      maxConcurrentRequests: 10,
      healthCheckInterval: 30000
    }
  };

  const eventBus = new EventBusService();
  const sharedServices = new SharedServices(testConfig, eventBus);
  const layerManager = new LayerManager(testConfig, eventBus);
  
  console.log('🔧 Initializing test services...');
  await sharedServices.initialize();
  await layerManager.initialize();

  const analyzer = new CodeAnalyzer(layerManager, sharedServices, testConfig, eventBus);
  await analyzer.initialize();

  console.log('📊 Inserting test data into concepts database...');
  
  // Insert test concepts
  await sharedServices.database.execute(
    `INSERT INTO concepts (id, canonical_name, confidence, category, metadata) 
     VALUES (?, ?, ?, ?, ?)`,
    ['test-func-1', 'testFunction', 0.9, 'function', JSON.stringify({ type: 'test' })]
  );

  // Insert corresponding symbol representations  
  await sharedServices.database.execute(
    `INSERT INTO symbol_representations 
     (concept_id, name, uri, start_line, start_character, end_line, end_character, occurrences, context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'test-func-1',
      'testFunction', 
      'file:///test/example.ts',
      10,
      5, 
      10,
      20,
      5,
      'function testFunction() { return "test"; }'
    ]
  );

  // Insert another concept with a similar name
  await sharedServices.database.execute(
    `INSERT INTO concepts (id, canonical_name, confidence, category) 
     VALUES (?, ?, ?, ?)`,
    ['test-var-1', 'TestVariable', 0.8, 'variable']
  );

  await sharedServices.database.execute(
    `INSERT INTO symbol_representations 
     (concept_id, name, uri, start_line, start_character, end_line, end_character, occurrences, context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'test-var-1',
      'TestVariable',
      'file:///test/vars.ts', 
      5,
      0,
      5,
      12,
      3,
      'const TestVariable = "hello";'
    ]
  );

  console.log('🔍 Testing Layer 3 semantic search...');

  // Test exact match
  console.log('\n📍 Test 1: Exact match for "testFunction"');
  const exactRequest: FindDefinitionRequest = {
    identifier: 'testFunction',
    uri: 'file:///test/search.ts',
    position: { line: 15, character: 10 },
    maxResults: 10
  };

  const exactResults = await analyzer.findDefinition(exactRequest);
  console.log(`Found ${exactResults.data?.length || 0} definitions:`);
  for (const def of exactResults.data || []) {
    console.log(`  - ${def.identifier} at ${def.uri}:${def.range.start.line}:${def.range.start.character}`);
    console.log(`    Kind: ${def.kind}, Source: ${def.source}, Confidence: ${def.confidence.toFixed(3)}`);
    if (def.metadata) {
      console.log(`    Metadata: ${JSON.stringify(def.metadata)}`);
    }
  }

  // Test fuzzy match  
  console.log('\n📍 Test 2: Fuzzy match for "test"');
  const fuzzyRequest: FindDefinitionRequest = {
    identifier: 'test',
    uri: 'file:///test/search.ts',
    position: { line: 20, character: 5 },
    maxResults: 10
  };

  const fuzzyResults = await analyzer.findDefinition(fuzzyRequest);
  console.log(`Found ${fuzzyResults.data?.length || 0} definitions:`);
  for (const def of fuzzyResults.data || []) {
    console.log(`  - ${def.identifier} at ${def.uri}:${def.range.start.line}:${def.range.start.character}`);
    console.log(`    Kind: ${def.kind}, Source: ${def.source}, Confidence: ${def.confidence.toFixed(3)}`);
  }

  // Test performance timing for each layer
  console.log('\n⏱️  Layer Performance:');
  console.log(`  Layer 1: ${exactResults.performance.layer1}ms`);  
  console.log(`  Layer 2: ${exactResults.performance.layer2}ms`);
  console.log(`  Layer 3: ${exactResults.performance.layer3}ms`);
  console.log(`  Layer 4: ${exactResults.performance.layer4}ms`);
  console.log(`  Layer 5: ${exactResults.performance.layer5}ms`);
  console.log(`  Total: ${exactResults.performance.total}ms`);

  // Test case-insensitive search
  console.log('\n📍 Test 3: Case-insensitive match for "TESTFUNCTION"');
  const caseRequest: FindDefinitionRequest = {
    identifier: 'TESTFUNCTION',
    uri: 'file:///test/search.ts',
    position: { line: 25, character: 8 },
    maxResults: 10
  };

  const caseResults = await analyzer.findDefinition(caseRequest);
  console.log(`Found ${caseResults.data?.length || 0} definitions:`);
  for (const def of caseResults.data || []) {
    console.log(`  - ${def.identifier} at ${def.uri}:${def.range.start.line}:${def.range.start.character}`);
    console.log(`    Kind: ${def.kind}, Source: ${def.source}, Confidence: ${def.confidence.toFixed(3)}`);
  }

  // Verify that Layer 3 is actually contributing results
  const layer3Results = (exactResults.data || []).filter(def => def.source === 'conceptual');
  console.log(`\n✅ Layer 3 contributed ${layer3Results.length} conceptual results`);

  if (layer3Results.length === 0) {
    console.log('⚠️  WARNING: Layer 3 is not returning any results! Check implementation.');
  } else {
    console.log('🎉 SUCCESS: Layer 3 ontology implementation is working correctly!');
  }

  // Clean up
  console.log('\n🧹 Cleaning up test services...');
  await analyzer.dispose();
  await sharedServices.dispose();
  await layerManager.dispose();

  // Remove test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Cleaned up test database');
  }

  console.log('\n✨ Layer 3 implementation test completed!');
}

// Run the test
testLayer3Implementation()
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });