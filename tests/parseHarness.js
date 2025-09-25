const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const snippetPath = path.join(__dirname, 'snippet.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const snippet = fs.readFileSync(snippetPath, 'utf8');

// Extract the parseHtmlToBlocks function body from index.html
const fnMatch = html.match(/function\s+parseHtmlToBlocks\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\n/);
if (!fnMatch) {
  console.error('Could not find parseHtmlToBlocks in index.html');
  process.exit(2);
}

const fnBody = fnMatch[1];

// Build a script that defines parseHtmlToBlocks in the jsdom window
const script = `
  function parseHtmlToBlocks(htmlString) {${fnBody}\n  }
  // expose for outer usage
  window.parseHtmlToBlocks = parseHtmlToBlocks;
`;

// Create a JSDOM environment and run the script
const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { runScripts: 'outside-only' });
const { window } = dom;

try {
  // evaluate DOMParser via jsdom (it's available in window)
  dom.window.eval(script);
} catch (err) {
  console.error('Failed to eval parser:', err);
  process.exit(3);
}

// Run parser on snippet
const blocks = dom.window.parseHtmlToBlocks(snippet);
console.log('Parsed blocks:', blocks.map(b => ({ id: b.id, text: b.text, parentId: b.parentId, x: b.x, y: b.y, width: b.width, height: b.height })));

// Basic assertions
const byText = {};
blocks.forEach(b => { if (b.text) byText[b.text] = byText[b.text] || []; byText[b.text].push(b); });

let failed = false;

if (!byText['Outer'] || byText['Outer'].length === 0) {
  console.error('Missing Outer block'); failed = true;
}
if (!byText['Inner'] || byText['Inner'].length === 0) {
  console.error('Missing Inner block'); failed = true;
}
if (!byText['Another'] || byText['Another'].length === 0) {
  console.error('Missing Another block'); failed = true;
}

// Check parent-child: Inner should have parentId equal to one of the Outer ids
if (!failed) {
  const inner = byText['Inner'][0];
  const outer = byText['Outer'][0];
  if (!inner.parentId) {
    console.error('Inner has no parentId'); failed = true;
  } else if (inner.parentId !== outer.id) {
    console.error('Inner.parentId does not match Outer.id (expected:', outer.id, 'got:', inner.parentId, ')');
    // but it's possible there are multiple Outer-like blocks; check any match
    const ok = byText['Outer'].some(o => o.id === inner.parentId);
    if (!ok) failed = true;
  }
}

if (failed) process.exit(1);
console.log('Test passed');
process.exit(0);
