// Regression test: ensure a 2-column visual layout generates `columns 2`
const fs = require('fs');

// Reuse extraction approach from test.js by loading the index.html and extracting functions
const htmlContent = fs.readFileSync('index.html', 'utf8');

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
            if (depth === 0) {
                return source.slice(idx, i + 1);
            }
        }
    }
    return null;
}

const parseText = extractFunction(htmlContent, 'parseBlockDiagramInput');
const genText = extractFunction(htmlContent, 'generateMermaidBlockDiagram');
if (!parseText || !genText) {
    console.error('Could not extract required functions from index.html');
    process.exit(1);
}

const parseBlockDiagramInput = eval('(' + parseText + ')');
const generateMermaidBlockDiagram = eval('(' + genText + ')');

// Build a logical layout matching the screenshot: two columns, two rows of simple blocks
// We will create blocks with grid coordinates so the generator must infer columns=2
const blocks = [
    { id: 'A', text: 'New Block', parentId: null, row: 0, col: 0, rowSpan: 1, colSpan: 1, blockWidth: 1 },
    { id: 'B', text: 'New Block', parentId: null, row: 0, col: 1, rowSpan: 1, colSpan: 1, blockWidth: 1 },
    { id: 'C', text: 'New Block', parentId: null, row: 1, col: 0, rowSpan: 1, colSpan: 1, blockWidth: 1 },
    { id: 'D', text: 'New Block', parentId: null, row: 1, col: 1, rowSpan: 1, colSpan: 1, blockWidth: 1 }
];

// generateMermaidBlockDiagram expects access to a global `blocks` and optionally detectAndCreateVerticalSpans
global.blocks = blocks.slice();

// Call generator — it should infer columns=2
const output = generateMermaidBlockDiagram(blocks);

if (!/columns\s+2/.test(output)) {
    throw new Error('Regression test failed: expected `columns 2` in generated output.\nGenerated output:\n' + output);
} else {
    console.log('Regression test passed: generator emitted `columns 2`.');
}
