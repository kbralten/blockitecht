// Test script to run round-trip tests with detailed output
const fs = require('fs');

// Read the HTML file and extract the JavaScript functions
const htmlContent = fs.readFileSync('index.html', 'utf8');

// Helper: extract a function's full text by finding the opening brace and
// matching braces until the function body is balanced. This is more robust
// than a single regex and tolerates formatting changes.
function extractFunction(source, name) {
    // Try to find a function declaration: function name(...){
    let idx = source.indexOf('function ' + name + '(');
    if (idx === -1) {
        // Try common assignment forms: 'const name = function(', 'let name = function(', 'var name = function(', or 'name = function('
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

    // Find the first '{' after the function start
    const braceOpen = source.indexOf('{', idx);
    if (braceOpen === -1) return null;

    // Walk the source counting braces to find the matching closing '}'
    let depth = 0;
    let i = braceOpen;
    for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                // Return the full function text from the 'function' keyword to the closing brace
                return source.slice(idx, i + 1);
            }
        }
    }

    return null;
}

// Extract the required functions
const parseText = extractFunction(htmlContent, 'parseBlockDiagramInput');
const genText = extractFunction(htmlContent, 'generateMermaidBlockDiagram');
const detectVerticalText = extractFunction(htmlContent, 'detectAndCreateVerticalSpans');

if (!parseText) {
    console.error('Could not extract parseBlockDiagramInput from HTML file');
    process.exit(1);
}

// Create a mock environment
let blocks = [];
const parseBlockDiagramInput = eval(`(${parseText})`);

// Extract detectAndCreateVerticalSpans if available
let detectAndCreateVerticalSpans;
if (detectVerticalText) {
    detectAndCreateVerticalSpans = eval(`(${detectVerticalText})`);
} else {
    // Fallback: no vertical span detection
    detectAndCreateVerticalSpans = (topLevelBlocks) => topLevelBlocks;
}
// Expose for generators that expect it on the global scope
global.detectAndCreateVerticalSpans = detectAndCreateVerticalSpans;

let generateMermaidBlockDiagram;
if (genText) {
    generateMermaidBlockDiagram = eval(`(${genText})`);
} else {
    // Fallback generator: produce a simple mermaid block diagram from blocks.
    // This supports top-level blocks, nested block:ID ... end, and width suffix :N.
    console.warn('generateMermaidBlockDiagram not found in HTML; using fallback generator for tests');
    function emitBlockRecursive(b, allBlocks, indent = '  ') {
        const children = allBlocks.filter(x => x.parentId === b.id);
        const span = b.blockWidth || 1;
        let line = '';
        if (children.length > 0) {
            // emit parent block start
            line += `${indent}block:${b.id}\n`;
            children.forEach(child => {
                line += emitBlockRecursive(child, allBlocks, indent + '  ');
            });
            line += `${indent}end\n`;
        } else {
            // leaf block: id[:N]["Label"]
            const label = b.text ? `\"${b.text.replace(/\"/g, '\\"')}\"` : '';
            line += `${indent}${b.id}${span>1?`:${span}`:''}${label}\n`;
        }
        return line;
    }

    generateMermaidBlockDiagram = function(blockList) {
        // naive columns: try to infer from top-level arrangement; default to 3
        const columns = 3;
        let out = `block\ncolumns ${columns}\n`;
        // emit top-level blocks in order
        for (const b of blockList) {
            out += emitBlockRecursive(b, blockList.concat(blocks));
        }
        return out;
    };
}

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
    },
    {
        name: 'Vertical span detection with invisible parent',
        input: `block
columns 2
  LeftTall["Left Tall Block"]
  TopRight["Top Right"]
  BottomRight["Bottom Right"]`
    }
];

// Add a specific test for block width spans (e.g., b:2 and c:2)
testCases.push({
        name: 'Block width spans',
        input: `block
columns 3
    a["A label"] b:2 c:2 d`
});

// Nested-width test: a parent block containing children that use width spans
testCases.push({
        name: 'Nested blocks with widths',
        input: `block
columns 3
    X
    block:PARENT
        a["Child A"] b:2 c:2 d
    end
    Y`
});

// Two-level nesting where the innermost children use width spans
testCases.push({
        name: 'Two-level nested widths',
        input: `block
columns 3
    block:OUTER
        block:INNER
            a:2 b c:2
        end
    end`
});

// UUID id round-trip test (ensure hyphenated IDs survive and are not split)
testCases.push({
    name: 'UUID id round-trip',
    input: `block
columns 3
  e1504ac3-2896-40d2-86c4-b27c8839ae65["UUID Block"]`
});

// Color round-trip test: use the annotation syntax produced by the generator (%%color:HEX)
testCases.push({
        name: 'Color round-trip',
        input: `block
columns 3
    A["Parent"] %%color:93C5FD
    block:CHILD
        a["Child A"] %%color:7DD3FC
        b["Child B"] %%color:60A5FA
    end`
});

// Clear-color round-trip: parse a diagram with colors, clear color on one block,
// generate and reparse; ensure the cleared block no longer carries a color token
testCases.push({
    name: 'Clear color round-trip',
    input: `block
columns 3
    A["Parent"] %%color:93C5FD
    block:CHILD
        a["Child A"] %%color:7DD3FC
        b["Child B"] %%color:60A5FA
    end`
});

// Title round-trip test: ensure leading Markdown heading is used as title and not tokenized as blocks
testCases.push({
    name: 'Title round-trip',
    input: `# The Title\n\nblock\ncolumns 1\n  244c2647-48da-45fd-823f-b4b494e6114b["Real Block"]`
});

// Smoke test: simulate moving a block into a parent and ensure the generator emits the nested block group
testCases.push({
    name: 'Move-into-parent smoke test',
    input: `block\ncolumns 2\n  A["Movable"]\n  block:PARENT\n    B["Sibling"]\n  end`
});

// Programmatic nested block generation test: create nested structure and verify generator output
testCases.push({
    name: 'Programmatic nested block generation',
    input: `block\ncolumns 1\n  TopLevel["Top Level Block"]` // Simple input to start with
});

console.log('🧪 Starting Round-Trip Test...\n');

// Failure counter: if >0 we'll exit with non-zero status for CI
let failures = 0;

testCases.forEach((testCase, index) => {
    console.log(`--- Test ${index + 1}: ${testCase.name} ---`);
    console.log('Input:', testCase.input);
    
    try {
        // Step 1: Parse input into blocks
        const { title, blocks: parsedBlocks } = parseBlockDiagramInput(testCase.input);
        // If this is the title round-trip test, assert the parser extracted the heading as the title
        if (testCase.name === 'Title round-trip') {
            const expectedTitle = 'The Title';
            if ((title || '') !== expectedTitle) {
                console.log(`❌ Title mismatch: expected "${expectedTitle}", got "${title}"`);
                failures += 1;
            } else {
                console.log(`✅ Title parsed correctly: "${title}"`);
            }
        }
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
        
        // For the clear-color test, simulate clearing color on CHILD (and descendants)
        if (testCase.name === 'Clear color round-trip') {
            // Find target block to clear color (prefer 'CHILD' id if present)
            const target = parsedBlocks.find(b => b.id === 'CHILD') || parsedBlocks[0];
            if (target) {
                // remove color from target and descendants
                const toClear = [target.id];
                for (const b of parsedBlocks) if (b.parentId === target.id) toClear.push(b.id);
                parsedBlocks.forEach(b => { if (toClear.includes(b.id) && b.color) delete b.color; });
                console.log('Cleared color for:', toClear);
            }
        }

        // For the move-into-parent smoke test, simulate moving block A into PARENT
        if (testCase.name === 'Move-into-parent smoke test') {
            const parent = parsedBlocks.find(b => b.id === 'PARENT');
            const childA = parsedBlocks.find(b => b.id === 'A' || (b.text && b.text.toLowerCase().includes('movable')));
            if (parent && childA) {
                // set the parentId to simulate the UI move
                childA.parentId = parent.id;
                console.log(`Simulated move: set ${childA.id}.parentId = ${parent.id}`);
            } else {
                console.log('Could not simulate move: parent or child not found');
            }
        }

        // For the programmatic nested block test, create a parent with children programmatically
        if (testCase.name === 'Programmatic nested block generation') {
            // Create parent block
            const parentBlock = {
                id: 'PROGRAMMATIC_PARENT',
                text: 'Programmatic Parent',
                x: 100, y: 100, width: 200, height: 80,
                parentId: null,
                originalId: 'PROGRAMMATIC_PARENT'
            };
            
            // Create child blocks
            const child1 = {
                id: 'CHILD_ONE',
                text: 'Child One',
                x: 120, y: 200, width: 80, height: 40,
                parentId: 'PROGRAMMATIC_PARENT'
            };
            
            const child2 = {
                id: 'CHILD_TWO',
                text: 'Child Two',
                x: 220, y: 200, width: 80, height: 40,
                parentId: 'PROGRAMMATIC_PARENT'
            };
            
            // Add the programmatically created blocks to the parsed blocks
            parsedBlocks.push(parentBlock, child1, child2);
            console.log('Added programmatic parent with 2 children to parsed blocks');
            
            // Important: Set the global blocks to include all blocks so generator can find children
            // The generator function falls back to global 'blocks' when looking for children
            blocks.splice(0, blocks.length, ...parsedBlocks);
        }

        // For the vertical span detection test, simulate blocks on canvas with vertical spanning
        if (testCase.name === 'Vertical span detection with invisible parent') {
            console.log('--- Vertical Span Simulation ---');
            
            // Clear existing parsed blocks and create vertical span layout
            parsedBlocks.splice(0, parsedBlocks.length);
            
            // Create blocks with pixel coordinates that form a vertical span layout:
            // Left column: one tall block
            // Right column: two smaller blocks stacked
            const leftTall = {
                id: 'LeftTall',
                text: 'Left Tall Block',
                parentId: null,
                x: 50,    // Left column
                y: 50,    // Top position
                width: 200,
                height: 140  // Spans height of two normal blocks
            };
            
            const topRight = {
                id: 'TopRight',
                text: 'Top Right',
                parentId: null,
                x: 270,   // Right column
                y: 50,    // Top position (same as leftTall)
                width: 200,
                height: 60  // Normal height
            };
            
            const bottomRight = {
                id: 'BottomRight',
                text: 'Bottom Right',
                parentId: null,
                x: 270,   // Right column (same as topRight)
                y: 110,   // Bottom position (topRight.y + topRight.height + small gap)
                width: 200,
                height: 60  // Normal height
            };
            
            // Add blocks to parsed array
            parsedBlocks.push(leftTall, topRight, bottomRight);
            console.log('Created vertical span layout: 1 tall left block + 2 stacked right blocks');
            
            // Update global blocks for generator
            blocks.splice(0, blocks.length, ...parsedBlocks);
        }

        // Step 3: Generate output from those blocks
        const output = generateMermaidBlockDiagram(parsedBlocks);
        console.log('\nGenerated output:');
        console.log(output);
        
        // Specific validation for vertical span detection test
        if (testCase.name === 'Vertical span detection with invisible parent') {
            console.log('\n--- Vertical Span Validation ---');
            const hasInvisibleParent = output.includes('block:InvisibleParent') && output.includes('end');
            const hasProperLayout = output.includes('TopRight') && output.includes('BottomRight');
            const leftTallSeparate = output.includes('LeftTall["Left Tall Block"]');
            
            if (hasInvisibleParent && hasProperLayout && leftTallSeparate) {
                console.log('✅ Vertical span detection working: invisible parent created for right column');
            } else {
                console.log('❌ Vertical span detection not working as expected');
                console.log(`  hasInvisibleParent: ${hasInvisibleParent}`);
                console.log(`  hasProperLayout: ${hasProperLayout}`);
                console.log(`  leftTallSeparate: ${leftTallSeparate}`);
                if (!hasInvisibleParent) {
                    console.log('  Expected: block:InvisibleParent1 ... end structure');
                }
            }
        }
        
        // Step 4: Parse the generated output back
        const { blocks: reparsedBlocks } = parseBlockDiagramInput(output);
        console.log('\n✅ Re-parsing successful');
        console.log('Reparsed blocks:', reparsedBlocks.map(b => ({ 
            id: b.id, 
            text: b.text, 
            parentId: b.parentId,
            originalId: b.originalId 
        })));
        
        // Step 5: Explicit assertions per block (id, text, parentId, and blockWidth)
        console.log('\n--- Structure & Width Assertions ---');
        const originalMap = new Map(parsedBlocks.map(b => [b.id, b]));
        const reparsedMap = new Map(reparsedBlocks.map(b => [b.id, b]));

        const diffs = [];

        // Ensure every original block exists in reparsed set and matches important properties
        for (const [id, orig] of originalMap.entries()) {
            const rep = reparsedMap.get(id);
            if (!rep) {
                diffs.push(`Missing block '${id}' in reparsed output`);
                continue;
            }

            const origWidth = orig.blockWidth || 1;
            const repWidth = rep.blockWidth || 1;
            if (origWidth !== repWidth) diffs.push(`Width mismatch for '${id}': original=${origWidth} reparsed=${repWidth}`);

            const origText = (orig.text || '').trim();
            const repText = (rep.text || '').trim();
            if (origText !== repText) diffs.push(`Text mismatch for '${id}': original="${origText}" reparsed="${repText}"`);

            const origParent = orig.parentId || null;
            const repParent = rep.parentId || null;
            // Allow generator-created InvisibleParentN to be the parent in reparsed output
            if (origParent !== repParent) {
                if (!(origParent === null && repParent && /^InvisibleParent\d+$/.test(repParent))) {
                    diffs.push(`Parent mismatch for '${id}': original=${origParent} reparsed=${repParent}`);
                }
            }
        }

        // Also detect unexpected extra blocks in the reparsed output
        for (const id of reparsedMap.keys()) {
            // Allow InvisibleParentN blocks emitted by generator to represent vertical spans
            if (/^InvisibleParent\d+$/.test(id)) continue;
            if (!originalMap.has(id)) diffs.push(`Unexpected extra block '${id}' found in reparsed output`);
        }

        console.log('Original count:', originalMap.size);
        console.log('Reparsed count:', reparsedMap.size);

        if (diffs.length === 0) {
            console.log('✅ Round-trip successful!\n');
        } else {
            console.log('❌ Round-trip failed - assertions failed:');
            diffs.forEach(d => console.log('  -', d));
            console.log();
            failures += diffs.length;
        }

        // Additional assertion for the Clear color test: ensure the cleared block(s) have no color tokens
        if (testCase.name === 'Clear color round-trip') {
            // Reparse the generated output textually to check for %%color tokens on the cleared block id
            // We expect that the target id 'CHILD' (parent) should not have a color token, but its children may have or not depending on clear
            const hasChildColor = output.includes('CHILD') && /CHILD\["[^"]*"\]\s*%%color:/.test(output);
            if (hasChildColor) {
                console.log('❌ Clear-color assertion failed: CHILD still has a color token in generated output');
                failures += 1;
            } else {
                console.log('✅ Clear-color assertion passed: CHILD has no color token in generated output');
            }
        }
        // Additional assertion for move-into-parent smoke test: ensure parent group emitted and reparsed parent relationship
        if (testCase.name === 'Move-into-parent smoke test') {
            const hasParentBlock = output.includes('block:PARENT');
            if (!hasParentBlock) {
                console.log('❌ Move test failed: generated output missing parent block group (block:PARENT)');
                failures += 1;
            } else {
                console.log('✅ Generated output includes parent block group');
            }

            // Ensure reparsed blocks show the moved child has the parentId set
            const movedChild = reparsedBlocks.find(b => b.id === 'A' || (b.text && b.text.toLowerCase().includes('movable')));
            if (!movedChild) {
                console.log('❌ Move test failed: moved child not found in reparsed blocks');
                failures += 1;
            } else if (movedChild.parentId !== 'PARENT') {
                console.log(`❌ Move test failed: moved child parentId expected 'PARENT' but got '${movedChild.parentId}'`);
                failures += 1;
            } else {
                console.log('✅ Reparsed child has correct parentId = PARENT');
            }
        }
        
        // Additional assertion for programmatic nested block test: ensure nested block:ID ... end output exists
        if (testCase.name === 'Programmatic nested block generation') {
            // Check that generated output contains the parent block group with nested syntax
            const hasNestedBlock = output.includes('block:PROGRAMMATIC_PARENT');
            const hasEndMarker = output.includes('end');
            
            if (!hasNestedBlock) {
                console.log('❌ Programmatic test failed: generated output missing nested parent block (block:PROGRAMMATIC_PARENT)');
                failures += 1;
            } else {
                console.log('✅ Generated output includes nested parent block group');
            }
            
            if (!hasEndMarker) {
                console.log('❌ Programmatic test failed: generated output missing end marker for nested block');
                failures += 1;
            } else {
                console.log('✅ Generated output includes end marker for nested block');
            }
            
            // Verify that child blocks are nested inside the parent block
            const parentStartIndex = output.indexOf('block:PROGRAMMATIC_PARENT');
            const endIndex = output.indexOf('end', parentStartIndex);
            
            if (parentStartIndex >= 0 && endIndex > parentStartIndex) {
                const nestedSection = output.slice(parentStartIndex, endIndex);
                const hasChild1 = nestedSection.includes('CHILD_ONE');
                const hasChild2 = nestedSection.includes('CHILD_TWO');
                
                if (!hasChild1 || !hasChild2) {
                    console.log('❌ Programmatic test failed: child blocks not found within parent block section');
                    failures += 1;
                } else {
                    console.log('✅ Child blocks found within parent block section');
                }
            } else {
                console.log('❌ Programmatic test failed: could not locate parent block section boundaries');
                failures += 1;
            }
            
            // Verify reparsed blocks maintain parent-child relationships
            const reparsedParent = reparsedBlocks.find(b => b.id === 'PROGRAMMATIC_PARENT');
            const reparsedChild1 = reparsedBlocks.find(b => b.id === 'CHILD_ONE');
            const reparsedChild2 = reparsedBlocks.find(b => b.id === 'CHILD_TWO');
            
            if (!reparsedParent || !reparsedChild1 || !reparsedChild2) {
                console.log('❌ Programmatic test failed: not all blocks found in reparsed output');
                failures += 1;
            } else if (reparsedChild1.parentId !== 'PROGRAMMATIC_PARENT' || reparsedChild2.parentId !== 'PROGRAMMATIC_PARENT') {
                console.log('❌ Programmatic test failed: reparsed children do not have correct parentId');
                failures += 1;
            } else {
                console.log('✅ Reparsed blocks maintain correct parent-child relationships');
            }
        }
        
        // Restore original blocks
        blocks = originalBlocks;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.log();
        failures += 1;
    }
});

console.log('🏁 Round-trip tests completed!');

// --- Manual assertion: inferred spans from pixel widths ---
console.log('\n--- Manual Test: inferred span from pixel widths ---');
{
    const originalBlocks = blocks;
    // Three small blocks in top row, one wide block in bottom row (3x width)
    const manualBlocks = [
        { id: 'a', text: 'A', parentId: null, x: 50, y: 50, width: 100, height: 60 },
        { id: 'b', text: 'B', parentId: null, x: 170, y: 50, width: 100, height: 60 },
        { id: 'c', text: 'C', parentId: null, x: 290, y: 50, width: 100, height: 60 },
        { id: 'bottom', text: 'Bottom', parentId: null, x: 50, y: 200, width: 300, height: 60 }
    ];

    blocks = manualBlocks; // Set global so generator can find children if needed
    const output = generateMermaidBlockDiagram(manualBlocks);
    console.log('Generated output for manual test:\n', output);

    if (output.includes('bottom:3')) {
        console.log('✅ Inferred width emitted as :3');
    } else {
        console.log('❌ Inferred width NOT emitted (expected bottom:3)');
        failures += 1;
    }

    blocks = originalBlocks;
}

// Exit non-zero on failures to be CI friendly
if (failures > 0) {
    console.log(`\nTests completed with ${failures} failure(s). Exiting with code 1.`);
    process.exit(1);
} else {
    console.log('\nAll tests passed. Exiting with code 0.');
    process.exit(0);
}

// --- Diagnostic: parse user-provided failing diagram ---
// This code runs only when test.js is executed directly; it's useful during
// local debugging. It will print parsed blocks for the supplied input.
if (require.main === module) {
    const failing = `block
columns 14
  29e35826-2d60-40d1-897b-db8ebc2f4131:6["New Block"]
  00703699-c23b-49b1-a27b-336c2cd13fd9:6["New Block"]
  66056953-de6f-4bc7-8038-ecd3574937ba:14["New Block"]
  0218f681-d166-49d7-9ef7-2e3f632e66c9["New Block"]`;

    console.log('\n--- Diagnostic parse of failing diagram ---');
    const { title, blocks: parsed } = parseBlockDiagramInput(failing);
    console.log('Parsed blocks count:', parsed.length);
    parsed.forEach((b, i) => console.log(`  [${i}] id=${b.id} text='${b.text}' x=${b.x} y=${b.y} width=${b.width} blockWidth=${b.blockWidth}`));
}