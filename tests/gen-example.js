const fs = require('fs');

const src = fs.readFileSync('blockitecht.html', 'utf8');
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
      depth--; if (depth === 0) return source.slice(idx, i+1);
    }
  }
  return null;
}

const parseText = extractFunction(src, 'parseBlockDiagramInput');
const genText = extractFunction(src, 'generateMermaidBlockDiagram');
const detectText = extractFunction(src, 'detectAndCreateVerticalSpans');
if (!parseText || !genText) { console.error('Missing functions'); process.exit(1); }

const parseBlockDiagramInput = eval('(' + parseText + ')');
const generateMermaidBlockDiagram = eval('(' + genText + ')');
if (detectText) global.detectAndCreateVerticalSpans = eval('(' + detectText + ')');

const input = `block
columns 2
  Task["A"] space Process["B"]
  Step["D"] space Action["C"]`;

const { blocks } = parseBlockDiagramInput(input);
console.log('Input:\n' + input + '\n--- Parsed blocks (for diagnostics):\n');
blocks.forEach(b => console.log(`  - ${b.id}: text='${b.text}' x=${b.x} y=${b.y} blockWidth=${b.blockWidth}`));
console.log('\n--- Generated output:\n');
console.log(generateMermaidBlockDiagram(blocks));
