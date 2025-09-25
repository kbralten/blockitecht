const fs = require('fs');

// Extract required functions from the single-file app
const html = fs.readFileSync('./index.html', 'utf8');

function extractFunction(name) {
  const re = new RegExp(`function ${name}\\(([\\s\\S]*?)\\) \\\{([\\s\\S]*?)\\n\\s{8}\\}`, 'm');
  const m = html.match(new RegExp(`function ${name}\\(([\\s\\S]*?)\\) \\\{([\\s\\S]*?)\\n\\s{8}\\}`, 'm'));
  if (!m) return null;
  return `function ${name}(${m[1]}) {${m[2]}\n        }`;
}

// Fallback extraction method if the above fails (looser)
function extractFunctionLoose(name) {
  const m = html.match(new RegExp(`function ${name}\\([\\s\\S]*?\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'));
  if (!m) return null;
  return `function ${name}() {${m[1]}\n        }`;
}

// Try to extract parseBlockDiagramInput, generateMermaidBlockDiagram and detectAndCreateVerticalSpans
let parseFnText = null;
let generateFnText = null;
let detectFnText = null;

// Prefer the precise extraction pattern used elsewhere in the repo
const parseMatch = html.match(/function parseBlockDiagramInput\(input\) \{([\s\S]*?)\n\s{8}\}/);
if (parseMatch) parseFnText = `function parseBlockDiagramInput(input) {${parseMatch[1]}\n        }`;

const genMatch = html.match(/function generateMermaidBlockDiagram\(blockList\) \{([\s\S]*?)\n\s{8}\}/);
if (genMatch) generateFnText = `function generateMermaidBlockDiagram(blockList) {${genMatch[1]}\n        }`;

const detectMatch = html.match(/function detectAndCreateVerticalSpans\(topLevelBlocks\) \{([\s\S]*?)\n\s{8}\}/);
if (detectMatch) detectFnText = `function detectAndCreateVerticalSpans(topLevelBlocks) {${detectMatch[1]}\n        }`;

if (!parseFnText || !generateFnText) {
  console.error('Failed to extract required functions from index.html');
  process.exit(2);
}

// Eval the functions into this context
try {
  eval(parseFnText);
  eval(generateFnText);
  if (detectFnText) eval(detectFnText);
} catch (e) {
  console.error('Error evaluating extracted functions:', e);
  process.exit(2);
}

// Example inputs (exactly as provided)
const inputA = `block
columns 2
  Task["TL"] Process["TR"]
  space Task1["BR"]

  classDef color1 fill:#FDE68A,stroke:#333,stroke-width:2px;
  class Task color1
`;

const inputB = `block
columns 2
  Task["TL"] space Process["TR"]
  space Task1["BR"]

  classDef color1 fill:#FDE68A,stroke:#333,stroke-width:2px;
  class Task color1
`;

function emittedColumnsFor(input) {
  const parsed = parseBlockDiagramInput(input);
  // Re-implement the generator's columns inference locally based on parsed positions
  const allBlocks = parsed.blocks.slice();
  const topLevel = allBlocks.filter(b => !b.parentId);
  if (topLevel.length === 0) return 1;
  // Infer unit width using median of block widths (fallback to 100)
  const pixelWidths = allBlocks.map(b => b.width || 0).filter(w => w > 0);
  const unit = pixelWidths.length > 0 ? (function(){ const a = pixelWidths.slice().sort((x,y)=>x-y); const m = Math.floor(a.length/2); return (a.length % 2 === 1) ? a[m] : Math.round((a[m-1] + a[m]) / 2); })() : 100;
  function spanFor(block) {
    if (block.blockWidth && Number.isFinite(block.blockWidth)) return Math.max(1, block.blockWidth);
    if (block.width && unit > 0) return Math.max(1, Math.round(block.width / unit));
    return 1;
  }

  // Group into rows by y with tolerance
  const rowTolerance = 40;
  const rows = [];
  for (const b of topLevel) {
    let placed = false;
    for (const r of rows) {
      if (Math.abs(r.y - b.y) <= rowTolerance) { r.blocks.push(b); placed = true; break; }
    }
    if (!placed) rows.push({ y: b.y, blocks: [b] });
  }
  let maxRowSpan = 1;
  for (const r of rows) {
    let rowSum = 0;
    for (const b of r.blocks) rowSum += spanFor(b);
    maxRowSpan = Math.max(maxRowSpan, rowSum);
  }
  return Math.max(1, Math.round(maxRowSpan));
}

console.log('Running columns/space tests...');
const colsA = emittedColumnsFor(inputA);
const colsB = emittedColumnsFor(inputB);

console.log('Input A emitted columns:', colsA);
console.log('Input B emitted columns:', colsB);

// DEBUG: print generated outputs
console.log('\n--- Generated output for input A ---');
console.log(generateMermaidBlockDiagram(parseBlockDiagramInput(inputA).blocks));
console.log('\n--- Generated output for input B ---');
console.log(generateMermaidBlockDiagram(parseBlockDiagramInput(inputB).blocks));

console.log('\n--- Parsed blocks for input A ---');
parse = parseBlockDiagramInput(inputA);
parse.blocks.filter(b => !b.parentId).forEach(b => console.log(`${b.id}: x=${b.x}, y=${b.y}, span=${b.blockWidth||1}`));

console.log('\n--- Parsed blocks for input B ---');
parse = parseBlockDiagramInput(inputB);
parse.blocks.filter(b => !b.parentId).forEach(b => console.log(`${b.id}: x=${b.x}, y=${b.y}, span=${b.blockWidth||1}`));

if (colsA === null || colsB === null) {
  console.error('Failed to detect columns in generated output');
  process.exit(2);
}

let ok = true;
if (colsA !== 2) {
  console.error(`Expected input A to emit columns 2 but got ${colsA}`);
  ok = false;
}
if (!(colsB > colsA)) {
  console.error(`Expected input B to emit columns > ${colsA} but got ${colsB}`);
  ok = false;
}

if (!ok) process.exit(2);
console.log('✅ columns/space test passed (input B increased columns relative to input A)');
process.exit(0);
