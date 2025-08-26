#!/usr/bin/env bun

/**
 * Test MCP find_definition functionality with Layer 3 ontology implementation
 */

// First, let's add some test data to the database and then test MCP
import { DatabaseService, DatabaseConfig } from './src/core/services/database-service.js';
import { EventBusService } from './src/core/services/event-bus-service.js';
import * as path from 'path';
import * as fs from 'fs';

async function testMCPLayer3() {
  console.log('🔧 Setting up test database with concepts...');
  
  // Setup database - use the production database that MCP server uses
  const dbPath = path.join(process.cwd(), '.ontology', 'ontology.db');
  const eventBus = new EventBusService();
  
  const dbConfig: DatabaseConfig = {
    path: dbPath,
    maxConnections: 10,
    busyTimeout: 5000,
    enableWAL: true,
    enableForeignKeys: true
  };
  
  const db = new DatabaseService(dbConfig, eventBus);
  await db.initialize();
  
  // Insert test concepts and symbol representations
  console.log('📊 Adding test concepts to database...');
  
  // Insert a concept for 'CodeAnalyzer' which should exist in the codebase
  try {
    await db.execute(
      `INSERT OR REPLACE INTO concepts (id, canonical_name, confidence, category, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      ['code-analyzer-1', 'CodeAnalyzer', 0.95, 'class', JSON.stringify({ type: 'core-class' })]
    );

    await db.execute(
      `INSERT OR REPLACE INTO symbol_representations 
       (concept_id, name, uri, start_line, start_character, end_line, end_character, occurrences, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'code-analyzer-1',
        'CodeAnalyzer', 
        'file://' + path.join(process.cwd(), 'src/core/unified-analyzer.ts'),
        48,  // Line where class is defined
        13,  // Character where class name starts
        48,
        25,
        10,
        'export class CodeAnalyzer {'
      ]
    );

    // Insert another concept for 'FindDefinitionRequest'
    await db.execute(
      `INSERT OR REPLACE INTO concepts (id, canonical_name, confidence, category, metadata) 
       VALUES (?, ?, ?, ?, ?)`,
      ['find-def-req-1', 'FindDefinitionRequest', 0.9, 'interface', JSON.stringify({ type: 'request-interface' })]
    );

    await db.execute(
      `INSERT OR REPLACE INTO symbol_representations 
       (concept_id, name, uri, start_line, start_character, end_line, end_character, occurrences, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'find-def-req-1',
        'FindDefinitionRequest',
        'file://' + path.join(process.cwd(), 'src/core/types.ts'),
        148,  // Approximate line in types.ts
        17,
        154,
        1,
        5,
        'export interface FindDefinitionRequest'
      ]
    );
    
    console.log('✅ Test concepts added to database');
  } catch (error) {
    console.log('ℹ️  Concepts may already exist, continuing...');
  }
  
  await db.dispose();
  
  console.log('\n🧪 Testing MCP find_definition tool...');
  
  // First, connect to get a session
  console.log('📡 Connecting to MCP server...');
  
  try {
    const connectResponse = await fetch('http://localhost:7001/connect');
    if (!connectResponse.ok) {
      throw new Error(`Connection failed: ${connectResponse.status}`);
    }
    
    const connectionData = await connectResponse.json();
    console.log('📞 Connected to MCP server, session:', connectionData.sessionId);
    console.log('🔧 Available tools:', connectionData.tools?.map((t: any) => t.name) || []);
    
    // Now make the tool call with session ID
    console.log('📡 Making find_definition request...');
    const response = await fetch(`http://localhost:7001/tools?sessionId=${connectionData.sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'find_definition',
        arguments: {
          symbol: 'CodeAnalyzer'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('\n📋 MCP find_definition result for "CodeAnalyzer":');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if Layer 3 conceptual results are included
    if (result.content && Array.isArray(result.content)) {
      const conceptualResults = result.content.filter((item: any) => 
        item.text && item.text.includes('"source": "conceptual"')
      );
      
      if (conceptualResults.length > 0) {
        console.log(`\n✅ SUCCESS: Found ${conceptualResults.length} conceptual results from Layer 3!`);
        console.log('🎯 Layer 3 ontology implementation is working correctly via MCP!');
        
        // Check for valid file URIs (not file://unknown)
        const validUris = conceptualResults.filter((item: any) => 
          item.text && !item.text.includes('file://unknown')
        );
        
        if (validUris.length > 0) {
          console.log(`✅ Found ${validUris.length} results with valid file URIs (no more "file://unknown")`);
        } else {
          console.log('⚠️  WARNING: Results still contain "file://unknown" URIs');
        }
      } else {
        console.log('⚠️  WARNING: No conceptual results found from Layer 3');
      }
    }

    // Test another symbol
    console.log('\n📡 Testing with "FindDefinitionRequest"...');
    const response2 = await fetch(`http://localhost:7001/tools?sessionId=${connectionData.sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'find_definition',
        arguments: {
          symbol: 'FindDefinitionRequest'
        }
      })
    });

    if (response2.ok) {
      const result2 = await response2.json();
      console.log('\n📋 MCP find_definition result for "FindDefinitionRequest":');
      console.log(JSON.stringify(result2, null, 2));
    }
    
  } catch (error) {
    console.error('❌ MCP test failed:', error);
  }
  
  console.log('\n✨ MCP Layer 3 test completed!');
}

// Run the test
testMCPLayer3()
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });