const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('blockitecht.html', 'utf8');

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
    let depth = 0; let i = braceOpen;
    for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return source.slice(idx, i+1); }
    }
    return null;
}

const parseText = extractFunction(html, 'parseBlockDiagramInput');
const genText = extractFunction(html, 'generateMermaidBlockDiagram');
const detectText = extractFunction(html, 'detectAndCreateVerticalSpans');

if (!parseText || !genText) {
    console.error('Could not extract necessary functions from blockitecht.html');
    process.exit(1);
}

const parseBlockDiagramInput = eval('(' + parseText + ')');
let detectAndCreateVerticalSpans = (t) => t;
if (detectText) detectAndCreateVerticalSpans = eval('(' + detectText + ')');
global.detectAndCreateVerticalSpans = detectAndCreateVerticalSpans;
const generateMermaidBlockDiagram = eval('(' + genText + ')');

const examples = [
    {
        name: 'Example 1',
        input: `block
columns 3
  Task["A"] Process["B"] space Action["C"]
  space Step["D"]`,
        // Expected canonical output (generator packs into columns)
        expected: `block
columns 3
  Task["A"] Process["B"]
  Action["C"] Step["D"]\n`
    },
    {
        name: 'Example 2',
        input: `block
columns 3
  Task["A"] space Process["B"]
  space Step["D"]`,
        expected: `block
columns 3
  Task["A"] space Process["B"]
  space Step["D"]\n`
    },
    {
        name: 'Example 3',
        input: `block
columns 3
  Task["A"] space Process["B"]
  space:2 Step["D"]`,
        expected: `block
columns 3
  Task["A"] space Process["B"]
  space:2 Step["D"]\n`
    }
];

examples.forEach(({name, input, expected}) => {
    console.log('Running', name);
    const parsed = parseBlockDiagramInput(input);
    const out = generateMermaidBlockDiagram(parsed.blocks);
    try {
        assert.strictEqual(out, expected);
        console.log('  ✅', name, 'passed');
    } catch (err) {
        console.error('  ❌', name, 'failed');
        console.error('--- Input ---\n' + input + '\n--- Expected ---\n' + expected + '\n--- Actual ---\n' + out);
        throw err;
    }
});

console.log('\nAll example tests passed');
