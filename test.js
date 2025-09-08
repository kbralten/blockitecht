// Test script to run round-trip tests with detailed output
const fs = require('fs');

// Read the HTML file and extract the JavaScript functions
const htmlContent = fs.readFileSync('blockitecht.html', 'utf8');

// Extract the parseBlockDiagramInput function
const parseMatch = htmlContent.match(/function parseBlockDiagramInput\(input\) \{[\s\S]*?\n        \}/);
const generateMatch = htmlContent.match(/function generateMermaidBlockDiagram\(blockList\) \{[\s\S]*?\n        \}/);

if (!parseMatch || !generateMatch) {
    console.error('Could not extract functions from HTML file');
    process.exit(1);
}

// Create a mock environment
let blocks = [];
const parseBlockDiagramInput = eval(`(${parseMatch[0]})`);
const generateMermaidBlockDiagram = eval(`(${generateMatch[0]})`);

// Test cases
const testCases = [
    {
        name: 'Simple blocks',
        input: `block
columns 3
  A["Frontend"]
  B["Backend"]`
    },
    {
        name: 'Nested blocks',
        input: `block
columns 1
  D
  block:ID
    A
    B["A wide one in the middle"]
    C
  end`
    },
    {
        name: 'Blocks with connections',
        input: `block
columns 2
  Frontend
  Backend
  Frontend --> Backend`
    }
];

console.log('🧪 Starting Round-Trip Test...\n');

testCases.forEach((testCase, index) => {
    console.log(`--- Test ${index + 1}: ${testCase.name} ---`);
    console.log('Input:', testCase.input);
    
    try {
        // Step 1: Parse input into blocks
        const { title, blocks: parsedBlocks } = parseBlockDiagramInput(testCase.input);
        console.log('✅ Parsing successful');
        console.log('Parsed blocks:', parsedBlocks.map(b => ({ 
            id: b.id, 
            text: b.text, 
            parentId: b.parentId,
            originalId: b.originalId 
        })));
        
        // Step 2: Simulate the blocks being loaded
        const originalBlocks = [...blocks];
        blocks = parsedBlocks;
        
        // Step 3: Generate output from those blocks
        const output = generateMermaidBlockDiagram(parsedBlocks);
        console.log('\nGenerated output:');
        console.log(output);
        
        // Step 4: Parse the generated output back
        const { blocks: reparsedBlocks } = parseBlockDiagramInput(output);
        console.log('\n✅ Re-parsing successful');
        console.log('Reparsed blocks:', reparsedBlocks.map(b => ({ 
            id: b.id, 
            text: b.text, 
            parentId: b.parentId,
            originalId: b.originalId 
        })));
        
        // Step 5: Compare structures
        const originalStructure = parsedBlocks.map(b => ({ id: b.id, text: b.text, parentId: b.parentId }));
        const reparsedStructure = reparsedBlocks.map(b => ({ id: b.id, text: b.text, parentId: b.parentId }));
        
        console.log('\n--- Structure Comparison ---');
        console.log('Original count:', originalStructure.length);
        console.log('Reparsed count:', reparsedStructure.length);
        
        const structuresMatch = JSON.stringify(originalStructure.sort((a,b) => a.id.localeCompare(b.id))) === 
                              JSON.stringify(reparsedStructure.sort((a,b) => a.id.localeCompare(b.id)));
        
        if (structuresMatch) {
            console.log('✅ Round-trip successful!\n');
        } else {
            console.log('❌ Round-trip failed - structures differ');
            console.log('\nOriginal structure:');
            originalStructure.forEach(b => console.log(`  - ${b.id}: "${b.text}" (parent: ${b.parentId || 'none'})`));
            console.log('\nReparsed structure:');
            reparsedStructure.forEach(b => console.log(`  - ${b.id}: "${b.text}" (parent: ${b.parentId || 'none'})`));
            console.log();
        }
        
        // Restore original blocks
        blocks = originalBlocks;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.log();
    }
});

console.log('🏁 Round-trip tests completed!');