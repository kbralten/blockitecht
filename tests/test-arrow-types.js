// Test script to demonstrate arrow type functionality
const fs = require('fs');
const path = require('path');

console.log('🏹 Testing Arrow Type Functionality...\n');

// Extract functions from the HTML file (same pattern as test.js)
function extractFunction(htmlContent, functionName) {
    const functionStartPattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
    const startMatch = functionStartPattern.exec(htmlContent);
    if (!startMatch) return null;

    let braceCount = 0;
    let inFunction = false;
    let functionCode = '';
    
    for (let i = startMatch.index; i < htmlContent.length; i++) {
        const char = htmlContent[i];
        functionCode += char;
        
        if (char === '{') {
            braceCount++;
            inFunction = true;
        } else if (char === '}' && inFunction) {
            braceCount--;
            if (braceCount === 0) break;
        }
    }
    
    return functionCode;
}

// Read the HTML file and extract functions
const htmlPath = path.join(__dirname, 'blockitecht.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const parseText = extractFunction(htmlContent, 'parseBlockDiagramInput');
const genText = extractFunction(htmlContent, 'generateMermaidBlockDiagram');

if (!parseText) {
    console.error('❌ Could not extract parseBlockDiagramInput from HTML file');
    process.exit(1);
}

// Evaluate the functions
const parseBlockDiagramInput = eval(`(${parseText})`);

let generateMermaidBlockDiagram;
if (genText) {
    // Extract and eval the detectAndCreateVerticalSpans function (required by generator)
    const detectText = extractFunction(htmlContent, 'detectAndCreateVerticalSpans');
    if (detectText) {
        global.detectAndCreateVerticalSpans = eval(`(${detectText})`);
    } else {
        global.detectAndCreateVerticalSpans = (blocks) => blocks;
    }
    
    generateMermaidBlockDiagram = eval(`(${genText})`);
} else {
    console.warn('generateMermaidBlockDiagram not found in HTML; using simplified fallback');
    generateMermaidBlockDiagram = function(blockList) {
        let output = 'block\\ncolumns 3\\n';
        blockList.forEach(block => {
            output += `  ${block.id}["${block.text}"]\\n`;
        });
        return output;
    };
}

// Test cases for different arrow types
const testCases = [
    {
        name: 'Forward Arrow (-->)',
        input: `block
columns 2
  A["Frontend"]
  B["Backend"]
  A --> B`,
        expectedArrowType: '-->'
    },
    {
        name: 'Line (---)',
        input: `block
columns 2
  A["Frontend"]
  B["Backend"]
  A --- B`,
        expectedArrowType: '---'
    },
    {
        name: 'Backward Arrow (<--)',
        input: `block
columns 2
  A["Frontend"]
  B["Backend"]
  A <-- B`,
        expectedArrowType: '-->', // Should be converted to B --> A internally
        expectedFrom: 'B',
        expectedTo: 'A'
    },
    {
        name: 'Arrow with Label',
        input: `block
columns 2
  A["Frontend"]
  B["Backend"]
  A -- "API calls" --> B`,
        expectedArrowType: '-->',
        expectedLabel: 'API calls'
    },
    {
        name: 'Line with Label',
        input: `block
columns 2
  A["Frontend"]
  B["Backend"]
  A -- "connects to" --- B`,
        expectedArrowType: '---',
        expectedLabel: 'connects to'
    }
];

let allTestsPassed = true;

testCases.forEach((testCase, index) => {
    console.log(`--- Test ${index + 1}: ${testCase.name} ---`);
    
    try {
        // Parse the input
        const { blocks, connections } = parseBlockDiagramInput(testCase.input);
        
        console.log(`Input: ${testCase.input.replace(/\n/g, '\\n')}`);
        console.log(`Parsed ${connections.length} connection(s)`);
        
        if (connections.length === 0) {
            console.log('❌ No connections parsed');
            allTestsPassed = false;
            return;
        }
        
        const conn = connections[0];
        console.log(`Connection: ${conn.from} ${conn.arrowType || '-->'} ${conn.to}`);
        if (conn.label) console.log(`Label: "${conn.label}"`);
        
        // Check arrow type
        if (testCase.expectedArrowType && conn.arrowType !== testCase.expectedArrowType) {
            console.log(`❌ Expected arrow type "${testCase.expectedArrowType}", got "${conn.arrowType}"`);
            allTestsPassed = false;
            return;
        }
        
        // Check from/to for backward arrows
        if (testCase.expectedFrom && conn.from !== testCase.expectedFrom) {
            console.log(`❌ Expected from "${testCase.expectedFrom}", got "${conn.from}"`);
            allTestsPassed = false;
            return;
        }
        
        if (testCase.expectedTo && conn.to !== testCase.expectedTo) {
            console.log(`❌ Expected to "${testCase.expectedTo}", got "${conn.to}"`);
            allTestsPassed = false;
            return;
        }
        
        // Check label
        if (testCase.expectedLabel && conn.label !== testCase.expectedLabel) {
            console.log(`❌ Expected label "${testCase.expectedLabel}", got "${conn.label}"`);
            allTestsPassed = false;
            return;
        }
        
        // Set global variables that the generator depends on
        global.blocks = blocks;
        global.connections = connections;
        
        // Generate output and check round-trip
        const generated = generateMermaidBlockDiagram(blocks);
        console.log(`Generated output:`);
        console.log(generated.split('\\n').map(line => `  ${line}`).join('\\n'));
        
        // Re-parse and check
        const { connections: reparsedConnections } = parseBlockDiagramInput(generated);
        
        if (reparsedConnections.length !== connections.length) {
            console.log(`❌ Round-trip failed: expected ${connections.length} connections, got ${reparsedConnections.length}`);
            allTestsPassed = false;
            return;
        }
        
        const reparsedConn = reparsedConnections[0];
        if (reparsedConn.arrowType !== conn.arrowType || 
            reparsedConn.from !== conn.from || 
            reparsedConn.to !== conn.to ||
            reparsedConn.label !== conn.label) {
            console.log('❌ Round-trip failed: connection properties changed');
            console.log(`  Original: ${conn.from} ${conn.arrowType} ${conn.to} (${conn.label})`);
            console.log(`  Reparsed: ${reparsedConn.from} ${reparsedConn.arrowType} ${reparsedConn.to} (${reparsedConn.label})`);
            allTestsPassed = false;
            return;
        }
        
        console.log('✅ Test passed - parsing, generation, and round-trip successful!');
        
    } catch (error) {
        console.log(`❌ Test failed with error: ${error.message}`);
        allTestsPassed = false;
    }
    
    console.log('');
});

if (allTestsPassed) {
    console.log('🎉 All arrow type tests passed!');
    console.log('');
    console.log('Arrow types now supported:');
    console.log('  --> : Forward arrow (default)');
    console.log('  --- : Line (no arrow)');
    console.log('  <-- : Backward arrow (automatically converted to reverse direction with -->)');
    console.log('');
    console.log('Usage in Mermaid syntax:');
    console.log('  A --> B                (A points to B with arrow)');
    console.log('  A --- B                (A connects to B with line)');
    console.log('  A <-- B                (equivalent to B --> A)');
    console.log('  A -- "label" --> B     (arrow with label)');
    console.log('');
    console.log('In the UI:');
    console.log('  - Right-click on any connection to access arrow type options');
    console.log('  - Choose "Set Line (---)", "Set Arrow (-->)", or "Set Arrow (<--)"');
    console.log('  - The <-- option will swap the connection direction automatically');
} else {
    console.log('❌ Some arrow type tests failed!');
    process.exit(1);
}