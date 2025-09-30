// Test that nested blocks preserve the same spacing logic as top-level blocks
const fs = require('fs');

const html = fs.readFileSync('./index.html', 'utf8');

function extractFunction(source, name) {
    let idx = source.indexOf('function ' + name + '(');
    if (idx === -1) {
        const variants = [
            'const ' + name + ' = function(',
            'let ' + name + ' = function(',
            'var ' + name + ' = function(',
            name + ' = function('
        ];
        for (const v of variants) {
            const p = source.indexOf(v);
            if (p !== -1) { idx = p; break; }
        }
    }
    if (idx === -1) return null;
    const braceOpen = source.indexOf('{', idx);
    if (braceOpen === -1) return null;
    let depth = 0;
    for (let i = braceOpen; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return source.slice(idx, i + 1);
        }
    }
    return null;
}

const parseText = extractFunction(html, 'parseBlockDiagramInput');
const genText = extractFunction(html, 'generateMermaidBlockDiagram');
const detectText = extractFunction(html, 'detectAndCreateVerticalSpans');

if (!parseText || !genText) {
    console.error('Could not extract necessary functions from index.html');
    process.exit(1);
}

const parseBlockDiagramInput = eval('(' + parseText + ')');
const generateMermaidBlockDiagram = eval('(' + genText + ')');
if (detectText) global.detectAndCreateVerticalSpans = eval('(' + detectText + ')');
else global.detectAndCreateVerticalSpans = (t) => t;

// Mock global variables
global.connections = [];
global.blocks = [];
global.gridSize = 100;
global.diagramStartTag = 'block';

console.log('🧪 Testing Nested Block Spacing Logic...\n');

// Test 1: Verify that nested blocks use the same spacing logic as top-level
console.log('--- Test 1: Nested spacing consistency ---');

// Create a structure where:
// - Top level has: A, B:2 in first row, space, C:2 in second row
// - C becomes a container with: CA, CB in first row, space, CC in second row
const input = `block
columns 3
  Task["A"] Step:2["B"]
  space Task1:2["C"]`;

const parsed = parseBlockDiagramInput(input);
console.log('Original parsed blocks:');
parsed.blocks.forEach(b => {
    console.log(`  ${b.id}: text="${b.text}", x=${b.x}, y=${b.y}, width=${b.width}, span=${b.blockWidth}`);
});

// Generate output for original structure
const originalOutput = generateMermaidBlockDiagram(parsed.blocks);
console.log('\nOriginal generated output:');
console.log(originalOutput);

// Now create the nested version with CA, CB, CC as children of Task1
const nestedBlocks = [
    // Top-level blocks (A and B stay the same, C becomes container)
    { id: 'Task', text: 'A', parentId: null, x: 0, y: 0, width: 100, height: 100, blockWidth: 1 },
    { id: 'Step', text: 'B', parentId: null, x: 100, y: 0, width: 200, height: 100, blockWidth: 2 },
    { id: 'Task1', text: 'C', parentId: null, x: 100, y: 100, width: 200, height: 100, blockWidth: 2 },
    // Children of Task1 - replicate the same structure: CA, CB in row 1, space, CC in row 2
    { id: 'Process', text: 'CA', parentId: 'Task1', x: 100, y: 120, width: 100, height: 80, blockWidth: 1 },
    { id: 'Step1', text: 'CB', parentId: 'Task1', x: 200, y: 120, width: 100, height: 80, blockWidth: 1 },
    { id: 'Action', text: 'CC', parentId: 'Task1', x: 200, y: 200, width: 100, height: 80, blockWidth: 1 }
];

global.blocks = nestedBlocks;
const nestedOutput = generateMermaidBlockDiagram(nestedBlocks.filter(b => !b.parentId));

console.log('\nNested structure generated output:');
console.log(nestedOutput);

// Verify that the nested structure contains space tokens within the container
const lines = nestedOutput.split('\n');
const containerStart = lines.findIndex(line => line.trim().startsWith('block:Task1'));
const containerEnd = lines.findIndex((line, index) => index > containerStart && line.trim() === 'end');

if (containerStart === -1) {
    console.error('❌ Container block not found in output');
    process.exit(1);
}

if (containerEnd === -1) {
    console.error('❌ Container end not found in output');
    process.exit(1);
}

const containerContent = lines.slice(containerStart + 1, containerEnd);
console.log('\nContainer content:');
containerContent.forEach(line => console.log(`  ${line}`));

// Check that the container content has spacing logic applied
const hasSpaceInContainer = containerContent.some(line => line.includes('space'));

if (hasSpaceInContainer) {
    console.log('✅ Test 1 passed - nested container preserves spacing logic!');
} else {
    console.error('❌ Test 1 failed - no space tokens found in nested container');
    process.exit(1);
}

// Test 2: Verify round-trip behavior
console.log('\n--- Test 2: Round-trip consistency ---');

const roundTripParsed = parseBlockDiagramInput(nestedOutput);
console.log('Round-trip parsed blocks:');
roundTripParsed.blocks.forEach(b => {
    console.log(`  ${b.id}: parent=${b.parentId || 'none'}, text="${b.text}"`);
});

// Check that we have the right structure
const topLevelBlocks = roundTripParsed.blocks.filter(b => !b.parentId);
const nestedBlocks2 = roundTripParsed.blocks.filter(b => b.parentId === 'Task1');

if (topLevelBlocks.length === 3 && nestedBlocks2.length === 3) {
    console.log('✅ Test 2 passed - round-trip preserves block structure!');
} else {
    console.error(`❌ Test 2 failed - expected 3 top-level and 3 nested blocks, got ${topLevelBlocks.length} and ${nestedBlocks2.length}`);
    process.exit(1);
}

console.log('\n🎉 All nested spacing tests passed!');
console.log('✅ Nested blocks now use the same grid-based spacing logic as top-level blocks');
console.log('✅ Leading spaces are preserved within containers');
console.log('✅ Round-trip parsing/generation maintains structure');
