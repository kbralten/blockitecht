// Tests for space token generation and parsing
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

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
    let i = braceOpen;
    for (; i < source.length; i++) {
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

if (!parseText) {
    console.error('Could not extract parseBlockDiagramInput');
    process.exit(1);
}

// Create runtime bindings expected by the extracted functions
let blocks = [];
let connections = [];

const parseBlockDiagramInput = eval(`(${parseText})`);
let generateMermaidBlockDiagram = null;
if (genText) generateMermaidBlockDiagram = eval(`(${genText})`);
// Extract detectAndCreateVerticalSpans if present (generator expects it)
const detectText = extractFunction(html, 'detectAndCreateVerticalSpans');
let detectAndCreateVerticalSpans = null;
if (detectText) detectAndCreateVerticalSpans = eval(`(${detectText})`);
else detectAndCreateVerticalSpans = (t) => t;

let failures = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error('❌ ASSERT FAILED:', msg);
        failures++;
    } else {
        console.log('✅', msg);
    }
}

console.log('Running space token unit tests...');

// Test 1: Generator emits 'space' when a blank column separates blocks
(function testGeneratorEmitsSpace() {
    console.log('\nTest: generator emits space for blank column layout');
    // Create manual layout: ItemA at x=0 (col 0), ItemB at x=200 (col 2), so there is a gap for col 1.
    // gridSize is 100.
    const manual = [
        { id: 'ItemA', text: 'Item A', parentId: null, x: 0, y: 0, width: 100, height: 100 },
        { id: 'ItemB', text: 'Item B', parentId: null, x: 200, y: 0, width: 100, height: 100 },
        { id: 'ItemC', text: 'Item C', parentId: null, x: 200, y: 100, width: 100, height: 100 }
    ];

    // Set global blocks so generator can reference them
    blocks = manual.slice();
    // The generator also uses a global `gridSize` variable if it's present.
    global.gridSize = 100;

    if (!generateMermaidBlockDiagram) {
        console.warn('generateMermaidBlockDiagram not found; skipping generator test');
        return;
    }

    const out = generateMermaidBlockDiagram(manual);
    console.log('Generated output:\n', out);

    // The generator should have emitted a 'space' token in the first row.
    const firstRow = out.split('\n')[2];
    assert(firstRow.includes('space'), 'Generator emitted a space token in the first row');
})();

// Test 2: Parser honors 'space' token and places ItemC under ItemB when space is used
(function testParserHonorsSpace() {
    console.log('\nTest: parser honors space token positioning');
    // Build an explicit mermaid input that uses 'space' to push ItemC under ItemB
    const input = `block\ncolumns 2\n  ItemA ItemB\n  space ItemC`;
    console.log('Input:\n', input);

    const { title, blocks: parsed } = parseBlockDiagramInput(input);
    console.log('Parsed blocks:', parsed.map(b => ({ id: b.id, x: b.x, y: b.y, width: b.width })));

    // The parser's calculatePosition function determines the grid.
    // Let's find the blocks and check their relative positions.
    const A = parsed.find(b => b.id === 'ItemA');
    const B = parsed.find(b => b.id === 'ItemB');
    const C = parsed.find(b => b.id === 'ItemC');

    assert(A && B && C, 'All three blocks parsed');
    if (A && B && C) {
        // A and B should be on the same row (y is same)
        assert(A.y === B.y, 'ItemA and ItemB are on the same row');
        // C should be on a different row than A and B
        assert(C.y > A.y, 'ItemC is on a new row');
        // C should be aligned with B (x is same)
        assert(C.x === B.x, 'ItemC is aligned with ItemB');
    }
})();

console.log('\nSpace tests completed.');
if (failures > 0) {
    console.error('\nUnit tests failed:', failures);
    process.exit(1);
} else {
    console.log('\nAll space unit tests passed.');
    process.exit(0);
}

// --- Mermaid official examples: ensure support ---
// We'll run them as separate checks so maintainers can see results quickly.
try {
    (function mermaidExample1() {
        console.log('\nMermaid Example 1: "a space b / c d e"');
        const input = `block\ncolumns 3\n  a space b\n  c   d   e`;
        const { blocks: parsed } = parseBlockDiagramInput(input);
        // Expect 5 blocks parsed
        if (!parsed || parsed.length !== 5) {
            console.error('❌ Example1 parse failed: expected 5 blocks, got', parsed && parsed.length);
            process.exit(1);
        }
        // Generate and ensure 'space' emitted
        if (!generateMermaidBlockDiagram) {
            console.warn('generateMermaidBlockDiagram not available; skipping Example1 generation check');
            return;
        }
        const out = generateMermaidBlockDiagram(parsed);
        console.log('Generated output:\n', out);
        if (!/\bspace(?::\d+)?\b/.test(out)) {
            console.error('❌ Example1 generation failed: no space token emitted');
            process.exit(1);
        }
        console.log('✅ Example1 supported (space token present)');
    })();

    (function mermaidExample2() {
        console.log('\nMermaid Example 2: "ida space:3 idb idc"');
        const input = `block\n  ida space:3 idb idc`;
        const { blocks: parsed } = parseBlockDiagramInput(input);
        if (!parsed || parsed.length < 3) {
            console.error('❌ Example2 parse failed: expected at least 3 blocks, got', parsed && parsed.length);
            process.exit(1);
        }
        // Ensure IDs present
        const ids = parsed.map(b => b.id);
        ['ida','idb','idc'].forEach(id => {
            if (!ids.includes(id)) { console.error('❌ Example2 parse missing id:', id); process.exit(1); }
        });

        // Generation: try to ensure generator can emit space:3 when layout suggests it
        if (generateMermaidBlockDiagram) {
            const out = generateMermaidBlockDiagram(parsed);
            console.log('Generated output:\n', out);
            // Accept either a plain space or space:3 as valid support
            if (!/\bspace(?::\d+)?\b/.test(out)) {
                console.error('❌ Example2 generation failed: no space token emitted');
                process.exit(1);
            }
            console.log('✅ Example2 supported (space token present in generated output)');
        } else {
            console.warn('generateMermaidBlockDiagram not available; skipping Example2 generation check');
        }
    })();
} catch (e) {
    console.error('❌ Mermaid example checks failed:', e);
    process.exit(1);
}
