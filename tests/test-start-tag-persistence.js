const fs = require('fs');
const src = fs.readFileSync('index.html', 'utf8');

function extractFunction(source, name) {
  let idx = source.indexOf('function ' + name + '(');
  if (idx === -1) {
    const variants = [
      'const ' + name + ' = function(',
      'let ' + name + ' = function(',
      'var ' + name + ' = function(',
      name + ' = function('
    ];
    for (const v of variants) { const p = source.indexOf(v); if (p !== -1) { idx = p; break; } }
  }
  if (idx === -1) return null;
  const braceOpen = source.indexOf('{', idx);
  if (braceOpen === -1) return null;
  let depth = 0;
  for (let i = braceOpen; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return source.slice(idx, i+1); }
  }
  return null;
}

const genText = extractFunction(src, 'generateMermaidBlockDiagram');
const detectText = extractFunction(src, 'detectAndCreateVerticalSpans');
if (!genText) { console.error('generateMermaidBlockDiagram not found'); process.exit(1); }
const generateMermaidBlockDiagram = eval('(' + genText + ')');
if (detectText) global.detectAndCreateVerticalSpans = eval('(' + detectText + ')');

// Minimal localStorage mock
const localStore = {};
global.localStorage = { getItem: k => (k in localStore ? localStore[k] : null), setItem: (k,v)=>{ localStore[k]=String(v); }, removeItem: k => { delete localStore[k]; } };

// Expose diagramStartTag global as generator expects it
global.diagramStartTag = 'block';

function runTest(tag) {
  localStore['diagramStartTag'] = tag;
  global.diagramStartTag = tag; // also set the global var

  const blocksToGenerate = [
    { id: 'A', text: 'A', parentId: null, x: 50, y: 50, width: 100, height: 60, blockWidth: 1 },
    { id: 'B', text: 'B', parentId: null, x: 250, y: 50, width: 100, height: 60, blockWidth: 1 }
  ];

  const out = generateMermaidBlockDiagram(blocksToGenerate);
  const firstLine = out.split('\n').find(l => l.trim().length > 0);
  if (!firstLine) throw new Error('No output produced');
  if (firstLine.trim() !== tag) {
    console.error('Expected start tag:', tag, 'but got:', firstLine.trim());
    process.exit(3);
  }
  console.log('✅ start-tag persisted and emitted as:', tag);
}

runTest('block');
runTest('block-beta');

console.log('\nAll start-tag persistence tests passed');
