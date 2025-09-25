const fs = require('fs');

// Extract functions from the HTML file
const html = fs.readFileSync('./index.html', 'utf8');

// Extract the parseBlockDiagramInput function
const parseMatch = html.match(/function parseBlockDiagramInput\(input\) \{([\s\S]*?)\n\s{8}}/);
if (!parseMatch) {
    console.error('❌ Could not extract parseBlockDiagramInput function');
    process.exit(1);
}
const parseFunction = `function parseBlockDiagramInput(input) {${parseMatch[1]}
        }`;

// Extract the generateMermaidBlockDiagram function
const generateMatch = html.match(/function generateMermaidBlockDiagram\(blockList\) \{([\s\S]*?)\n\s{8}}/);
if (!generateMatch) {
    console.error('❌ Could not extract generateMermaidBlockDiagram function');
    process.exit(1);
}
const generateFunction = `function generateMermaidBlockDiagram(blockList) {${generateMatch[1]}
        }`;

// Extract the detectAndCreateVerticalSpans function
const detectMatch = html.match(/function detectAndCreateVerticalSpans\(topLevelBlocks\) \{([\s\S]*?)\n\s{8}}/);
if (!detectMatch) {
    console.error('❌ Could not extract detectAndCreateVerticalSpans function');
    process.exit(1);
}
const detectFunction = `function detectAndCreateVerticalSpans(topLevelBlocks) {${detectMatch[1]}
        }`;

// Set up global context
eval(parseFunction);
eval(generateFunction);
eval(detectFunction);

// Mock global variables
global.connections = [];
global.blocks = [];

console.log('🎨 Testing Color ClassDef Functionality...\n');

// Test 1: Generate classDef format from colored blocks
console.log('--- Test 1: Generate classDef from colored blocks ---');
const coloredBlocks = [
    { id: 'A', text: 'Block A', x: 20, y: 20, width: 100, height: 40, color: '#ff0000' },
    { id: 'B', text: 'Block B', x: 140, y: 20, width: 100, height: 40, color: '#00ff00' },
    { id: 'C', text: 'Block C', x: 20, y: 80, width: 100, height: 40, color: '#ff0000' } // Same color as A
];

const generated = generateMermaidBlockDiagram(coloredBlocks);
console.log('Generated Mermaid:');
console.log(generated);

// Verify classDef and class statements are present
const hasClassDef = generated.includes('classDef');
const hasClass = generated.includes('class A color1') || generated.includes('class A color');
const noOldColorTokens = !generated.includes('%%color:');

console.log(`✅ Contains classDef: ${hasClassDef}`);
console.log(`✅ Contains class statements: ${hasClass}`);
console.log(`✅ No old %%color tokens: ${noOldColorTokens}`);

if (hasClassDef && hasClass && noOldColorTokens) {
    console.log('✅ Test 1 passed - generation uses correct classDef format!\n');
} else {
    console.log('❌ Test 1 failed\n');
    process.exit(1);
}

// Test 2: Parse classDef format back to colored blocks
console.log('--- Test 2: Parse classDef format back to colored blocks ---');
const input = `block
columns 2
  A["Block A"] B["Block B"]
  C["Block C"]

  classDef color1 fill:#ff0000,stroke:#333,stroke-width:2px;
  classDef color2 fill:#00ff00,stroke:#333,stroke-width:2px;
  class A color1
  class B color2
  class C color1`;

const parsed = parseBlockDiagramInput(input);
console.log('Parsed blocks:');
parsed.blocks.forEach(block => {
    console.log(`  ${block.id}: text="${block.text}", color="${block.color || 'none'}"`);
});

// Verify colors were parsed correctly
const blockA = parsed.blocks.find(b => b.id === 'A');
const blockB = parsed.blocks.find(b => b.id === 'B');
const blockC = parsed.blocks.find(b => b.id === 'C');

const aHasRed = blockA && blockA.color === '#ff0000';
const bHasGreen = blockB && blockB.color === '#00ff00';
const cHasRed = blockC && blockC.color === '#ff0000';

console.log(`✅ Block A has red color: ${aHasRed}`);
console.log(`✅ Block B has green color: ${bHasGreen}`);
console.log(`✅ Block C has red color: ${cHasRed}`);

if (aHasRed && bHasGreen && cHasRed) {
    console.log('✅ Test 2 passed - parsing handles classDef correctly!\n');
} else {
    console.log('❌ Test 2 failed\n');
    process.exit(1);
}

// Test 3: Round-trip test - colored blocks through generate and parse
console.log('--- Test 3: Round-trip test with colors ---');
const originalBlocks = [
    { id: 'X', text: 'Red Block', x: 20, y: 20, width: 100, height: 40, color: '#990000' },
    { id: 'Y', text: 'Blue Block', x: 140, y: 20, width: 100, height: 40, color: '#0000cc' }
];

const roundTripGenerated = generateMermaidBlockDiagram(originalBlocks);
console.log('Round-trip generated:');
console.log(roundTripGenerated);

const roundTripParsed = parseBlockDiagramInput(roundTripGenerated);
console.log('Round-trip parsed blocks:');
roundTripParsed.blocks.forEach(block => {
    console.log(`  ${block.id}: text="${block.text}", color="${block.color || 'none'}"`);
});

// Verify round-trip preserved colors
const xBlock = roundTripParsed.blocks.find(b => b.id === 'X');
const yBlock = roundTripParsed.blocks.find(b => b.id === 'Y');

const xColorPreserved = xBlock && xBlock.color === '#990000';
const yColorPreserved = yBlock && yBlock.color === '#0000cc';

console.log(`✅ X block color preserved: ${xColorPreserved}`);
console.log(`✅ Y block color preserved: ${yColorPreserved}`);

if (xColorPreserved && yColorPreserved) {
    console.log('✅ Test 3 passed - round-trip preserves colors correctly!\n');
} else {
    console.log('❌ Test 3 failed\n');
    process.exit(1);
}

// Test 4: Backwards compatibility with old %%color format
console.log('--- Test 4: Backwards compatibility with old %%color format ---');
const oldFormatInput = `block
columns 2
  A["Block A"] %%color:ff5500 B["Block B"] %%color:0055ff`;

const backwardsCompatParsed = parseBlockDiagramInput(oldFormatInput);
console.log('Backwards compatibility parsed blocks:');
backwardsCompatParsed.blocks.forEach(block => {
    console.log(`  ${block.id}: text="${block.text}", color="${block.color || 'none'}"`);
});

const backwardsA = backwardsCompatParsed.blocks.find(b => b.id === 'A');
const backwardsB = backwardsCompatParsed.blocks.find(b => b.id === 'B');

const aHasOldColor = backwardsA && backwardsA.color === '#ff5500';
const bHasOldColor = backwardsB && backwardsB.color === '#0055ff';

console.log(`✅ Block A backwards compat color: ${aHasOldColor}`);
console.log(`✅ Block B backwards compat color: ${bHasOldColor}`);

if (aHasOldColor && bHasOldColor) {
    console.log('✅ Test 4 passed - backwards compatibility maintained!\n');
} else {
    console.log('❌ Test 4 failed\n');
    process.exit(1);
}

console.log('🎉 All color classDef tests passed!\n');
console.log('Color styling now supported:');
console.log('  ✅ Generate: Creates classDef and class statements');
console.log('  ✅ Parse: Understands classDef and class statements');  
console.log('  ✅ Round-trip: Colors preserved through generate → parse → generate');
console.log('  ✅ Backwards compatible: Still supports old %%color: format');
console.log('\nMermaid syntax examples:');
console.log('  New format: classDef red fill:#ff0000; class blockId red');
console.log('  Old format: blockId["Label"] %%color:ff0000 (still works)');