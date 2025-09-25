// Targeted test: ensure the sum-of-spans rule holds for non-final rows
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
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return source.slice(idx, i+1); }
  }
  return null;
}

const parseText = extractFunction(html, 'parseBlockDiagramInput');
const genText = extractFunction(html, 'generateMermaidBlockDiagram');
if (!parseText || !genText) {
  console.error('Could not extract required functions from blockitecht.html');
  process.exit(1);
}

const parseBlockDiagramInput = eval('(' + parseText + ')');
const generateMermaidBlockDiagram = eval('(' + genText + ')');

// Extract detectAndCreateVerticalSpans if present and make it available globally
const detectText = extractFunction(html, 'detectAndCreateVerticalSpans');
if (detectText) {
  const detectFn = eval('(' + detectText + ')');
  // generator expects detectAndCreateVerticalSpans to be visible (in-browser it is in scope)
  global.detectAndCreateVerticalSpans = detectFn;
}

function parseGeneratedRows(output) {
  const lines = output.split(/\r?\n/);
  let columns = null;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const colMatch = l.match(/^columns\s+(\d+)$/);
    if (colMatch) columns = parseInt(colMatch[1], 10);
    // top-level inline rows are emitted with two-space indent and token lists
    // skip lines that start with '  block:' since those are parent block groups
    if (/^\s{2}(?!block:)/.test(l)) {
      const tokenLine = l.trim();
      if (tokenLine) rows.push(tokenLine);
    }
    // stop collecting rows when we reach a blank line or classDef/class section or connections
    if (/^\s*$/.test(l)) continue;
  }
  return { columns, rows };
}

function sumSpansForToken(token) {
  // space or space:N
  const sm = token.match(/^space(?::(\d+))?$/);
  if (sm) return sm[1] ? parseInt(sm[1], 10) : 1;
  // block:ID[...] treat as span 1
  if (/^block:/.test(token)) return 1;
  // id:N or id
  const bm = token.match(/^([\w-]+)(?::(\d+))?(?:\[.*\])?$/);
  if (bm) return bm[2] ? parseInt(bm[2], 10) : 1;
  // fallback 1
  return 1;
}

function assertSumOfSpans(output, diagName) {
  const { columns, rows } = parseGeneratedRows(output);
  if (!columns) throw new Error('No columns found in generated output');
  if (!rows || rows.length === 0) throw new Error('No top-level rows found in generated output');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
      // Tokenize respecting labels like ["New Block"] which contain spaces
      const tokenRegex = /(?:space(?::\d+)?)|(?:block:[\w-]+(?:\["[^"]*"\])?)|(?:[\w-]+(?::\d+)?(?:\["[^"]*"\])?)/g;
      const tokens = [];
      let m;
      while ((m = tokenRegex.exec(row)) !== null) tokens.push(m[0]);
      const sum = tokens.reduce((s, t) => s + sumSpansForToken(t), 0);
    // For non-final rows the sum should equal columns
    if (i < rows.length - 1) {
      try {
        assert.strictEqual(sum, columns, `Row ${i} in diagram '${diagName}' sums to ${sum} but columns=${columns} (tokens: ${tokens.join(' ')})`);
      } catch (err) {
        console.error('\nFAILED diagram:', diagName);
        console.error('Generated rows:', rows);
        throw err;
      }
    } else {
      // Final row may be partial; its sum must be <= columns
      try {
        assert.ok(sum <= columns, `Final row ${i} in diagram '${diagName}' sums to ${sum} which is greater than columns=${columns} (tokens: ${tokens.join(' ')})`);
      } catch (err) {
        console.error('\nFAILED diagram (final row):', diagName);
        console.error('Generated rows:', rows);
        throw err;
      }
    }
  }
}

// Real-world diagrams to test (various edge cases)
const diagrams = [
  {
    name: 'Manual-inference example',
    input: `block
columns 3
  a["A"] b["B"] c["C"]
  bottom:3["Bottom"]`
  },
  {
    name: 'Space tokens example',
    input: `block
columns 4
  Left
  space:2
  Right
  Mid`
  },
  {
    name: 'Mixed spans and spaces',
    input: `block
columns 6
  A
  space:1
  B:2 C:2
  D`
  },
  {
    name: 'Large UUID spans (diagnostic case)',
    input: `block
columns 14
  29e35826-2d60-40d1-897b-db8ebc2f4131:6["New Block"]
  00703699-c23b-49b1-a27b-336c2cd13fd9:6["New Block"]
  66056953-de6f-4bc7-8038-ecd3574937ba:14["New Block"]
  0218f681-d166-49d7-9ef7-2e3f632e66c9["New Block"]`
  }
];

let failures = 0;
for (const d of diagrams) {
  try {
    const { blocks } = parseBlockDiagramInput(d.input);
    const out = generateMermaidBlockDiagram(blocks);
    assertSumOfSpans(out, d.name);
    console.log(`✅ ${d.name} passed`);
  } catch (err) {
    console.error(`❌ ${d.name} FAILED:`, err.message);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} diagram(s) failed sum-of-spans assertions.`);
  process.exit(1);
} else {
  console.log('\nAll sum-of-spans tests passed.');
  process.exit(0);
}
