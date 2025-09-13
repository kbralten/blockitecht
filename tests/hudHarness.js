// HUD DOM Test Harness
// Tests the Color HUD behavior using jsdom to simulate DOM interactions
//
// This test harness verifies:
// 1. HUD element existence and basic structure
// 2. Color swatch generation (preset colors + clear swatch)
// 3. HUD visibility based on block selection state
// 4. Current color highlighting in HUD
// 5. Color application via swatch clicks
// 6. Color clearing via clear swatch
// 7. Tree-based color assignment and clearing
// 8. Multi-block selection handling
//
// The tests extract the actual buildHud/updateColorHud functions from 
// blockitecht.html and run them in a jsdom environment with mock dependencies.

const fs = require('fs');
const { JSDOM } = require('jsdom');

// Track test results
let failures = 0;
let tests = 0;

function test(name, fn) {
    tests++;
    console.log(`\n--- Test ${tests}: ${name} ---`);
    try {
        fn();
        console.log('✅ Passed');
    } catch (error) {
        console.error('❌ Failed:', error.message);
        failures++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Helper: extract a function's full text by finding the opening brace and
// matching braces until the function body is balanced.
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

// Extract array definition by finding the assignment
function extractArray(source, name) {
    const pattern = new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]+)\\]`, 'g');
    const match = pattern.exec(source);
    if (match) {
        try {
            return eval(`[${match[1]}]`);
        } catch (e) {
            return null;
        }
    }
    return null;
}

console.log('🧪 Starting HUD DOM Tests...\n');

// Create a minimal DOM environment
const dom = new JSDOM(`<!DOCTYPE html>
<html>
<head>
    <style>
        .color-hud { position: absolute; display:flex; gap:8px; padding:6px; background: rgba(255,255,255,0.96); border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 8px 20px rgba(15,23,42,0.08); z-index:1500; }
        .color-hud.hidden { display:none }
        .color-hud .sw { width:28px; height:28px; border-radius:6px; border:2px solid transparent; cursor:pointer; box-sizing:border-box; transition: all 0.15s ease; }
        .color-hud .sw.current { border-color: #111; box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.3); }
        .color-hud .clear-swatch { background: transparent; border-color: #9CA3AF; color: #374151; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
        .color-hud .color-swatch-hud { border: 2px solid transparent; }
    </style>
</head>
<body>
    <div id="color-hud" class="color-hud hidden" aria-hidden="true"></div>
</body>
</html>`);

const { window } = dom;
const { document } = window;

// Load the HTML file and extract functions
const htmlContent = fs.readFileSync('blockitecht.html', 'utf8');

// Extract the necessary functions and data
const buildHudText = extractFunction(htmlContent, 'buildHud');
const updateColorHudText = extractFunction(htmlContent, 'updateColorHud');
const assignColorsToTreeText = extractFunction(htmlContent, 'assignColorsToTree');
const clearColorsFromTreeText = extractFunction(htmlContent, 'clearColorsFromTree');
const getDepthText = extractFunction(htmlContent, 'getDepth');
const presetColors = extractArray(htmlContent, 'presetColors');

if (!buildHudText || !updateColorHudText || !presetColors) {
    console.error('❌ Failed to extract required functions or data from HTML file');
    process.exit(1);
}

// Set up the environment with mock globals
const blocks = [];
const selectedBlocks = new Set();
const colorHud = document.getElementById('color-hud');

// Add mock canvas container to DOM
const canvasContainer = document.createElement('div');
canvasContainer.id = 'canvas-container';
canvasContainer.style.width = '800px';
canvasContainer.style.height = '600px';
document.body.appendChild(canvasContainer);

// Mock the missing functions that the HUD functions depend on
const draw = () => {}; // Mock draw function
const updateMarkdown = () => {}; // Mock updateMarkdown function

// Define helper functions in the global scope
const getBlockById = id => blocks.find(b => b.id === id);
const getParent = block => block?.parentId ? getBlockById(block.parentId) : null;

function getDescendants(rootBlock, allBlocks, includeSelf = false) {
    const descendants = includeSelf ? [rootBlock] : [];
    const queue = allBlocks.filter(b => b.parentId === rootBlock.id);
    const visited = new Set(queue.map(b => b.id));
    visited.add(rootBlock.id);
    
    while(queue.length > 0) {
        const current = queue.shift();
        descendants.push(current);
        const children = allBlocks.filter(b => b.parentId === current.id);
        for(const child of children) {
            if(!visited.has(child.id)) {
                visited.add(child.id);
                queue.push(child);
            }
        }
    }
    return descendants;
}

const getDepth = getDepthText ? eval(`(${getDepthText})`) : (block) => {
    let depth = 0;
    let current = block;
    while (current && current.parentId) {
        depth++;
        current = blocks.find(b => b.id === current.parentId);
    }
    return depth;
};

const assignColorsToTree = assignColorsToTreeText ? eval(`(${assignColorsToTreeText})`) : (rootBlock, startIdx) => {
    if (!rootBlock || !presetColors) return;
    const color = presetColors[startIdx % presetColors.length];
    rootBlock.color = color;
    
    // Apply to children recursively
    const children = blocks.filter(b => b.parentId === rootBlock.id);
    children.forEach((child, i) => assignColorsToTree(child, startIdx + i + 1));
};

const clearColorsFromTree = clearColorsFromTreeText ? eval(`(${clearColorsFromTreeText})`) : (rootBlock) => {
    if (!rootBlock) return;
    delete rootBlock.color;
    
    // Clear from children recursively  
    const children = blocks.filter(b => b.parentId === rootBlock.id);
    children.forEach(child => clearColorsFromTree(child));
};

// Evaluate the HUD functions in the current context
const buildHud = eval(`(${buildHudText})`);
const updateColorHud = eval(`(${updateColorHudText})`);

// Now run the tests

test('HUD Element Exists', () => {
    assert(colorHud, 'colorHud element should exist');
    assert(colorHud.id === 'color-hud', 'colorHud should have id color-hud');
    assert(colorHud.classList.contains('color-hud'), 'colorHud should have color-hud class');
});

test('presetColors Array Validity', () => {
    assert(Array.isArray(presetColors), 'presetColors should be an array');
    assert(presetColors.length === 12, `presetColors should have 12 colors, got ${presetColors.length}`);
    
    // Each color should be a valid hex string (6 characters, no #)
    presetColors.forEach((color, index) => {
        assert(typeof color === 'string', `Color ${index} should be a string`);
        assert(color.length === 6, `Color ${index} should be 6 characters, got ${color.length}`);
        assert(/^[0-9A-Fa-f]{6}$/.test(color), `Color ${index} should be valid hex: ${color}`);
    });
});

test('buildHud Creates Color Swatches', () => {
    // Clear any existing HUD content
    colorHud.innerHTML = '';
    
    // Build the HUD
    buildHud();
    
    // Check that HUD has children
    assert(colorHud.children.length > 0, 'HUD should have child elements after buildHud()');
    
    // Should have clear swatch + preset color swatches
    const expectedCount = 1 + presetColors.length; // clear button + color swatches
    assert(colorHud.children.length === expectedCount, `HUD should have ${expectedCount} children, got ${colorHud.children.length}`);
    
    // First child should be clear swatch
    const clearSwatch = colorHud.children[0];
    assert(clearSwatch.classList.contains('clear-swatch'), 'First child should be clear swatch');
    assert(clearSwatch.innerText === '×', 'Clear swatch should have × text');
    
    // Rest should be color swatches
    for (let i = 1; i < colorHud.children.length; i++) {
        const swatch = colorHud.children[i];
        assert(swatch.classList.contains('color-swatch-hud'), `Child ${i} should be color swatch`);
        assert(swatch.dataset.hex, `Child ${i} should have hex data attribute`);
        assert(swatch.style.backgroundColor, `Child ${i} should have background color`);
    }
});

test('HUD Hidden When No Selection', () => {
    // Clear selection
    selectedBlocks.clear();
    
    // Update HUD
    updateColorHud();
    
    // Should be hidden
    assert(colorHud.classList.contains('hidden'), 'HUD should be hidden when no blocks selected');
});

test('HUD Visible When Block Selected', () => {
    // Create a mock block and add to selection
    const mockBlock = {
        id: 'test-block',
        text: 'Test Block',
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        parentId: null
    };
    
    // Add to blocks array and selection
    blocks.push(mockBlock);
    selectedBlocks.add(mockBlock);
    
    // Update HUD
    updateColorHud();
    
    // Should be visible
    assert(!colorHud.classList.contains('hidden'), 'HUD should be visible when block is selected');
    
    // Clean up
    blocks.pop();
    selectedBlocks.clear();
});

test('HUD Shows Current Color', () => {
    // Create a mock block with a specific color
    const testColor = presetColors[0]; // Use first preset color
    const mockBlock = {
        id: 'colored-block',
        text: 'Colored Block',
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        parentId: null,
        color: testColor
    };
    
    // Add to blocks and selection
    blocks.push(mockBlock);
    selectedBlocks.add(mockBlock);
    
    // Build and update HUD
    buildHud();
    updateColorHud();
    
    // Check that the matching color swatch has 'current' class
    const swatches = colorHud.querySelectorAll('.color-swatch-hud');
    let foundCurrent = false;
    swatches.forEach(swatch => {
        if (swatch.dataset.hex === testColor) {
            assert(swatch.classList.contains('current'), `Swatch for color ${testColor} should have 'current' class`);
            foundCurrent = true;
        } else {
            assert(!swatch.classList.contains('current'), `Only the matching swatch should have 'current' class`);
        }
    });
    assert(foundCurrent, `Should find a swatch with current class for color ${testColor}`);
    
    // Clean up
    blocks.pop();
    selectedBlocks.clear();
});

test('Color Swatch Click Applies Color', () => {
    // Create a mock block
    const mockBlock = {
        id: 'click-test-block',
        text: 'Click Test Block',
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        parentId: null
    };
    
    // Add to blocks and selection
    blocks.push(mockBlock);
    selectedBlocks.add(mockBlock);
    
    // Build HUD
    buildHud();
    
    // Get a color swatch (first color swatch, not the clear button)
    const colorSwatch = colorHud.querySelector('.color-swatch-hud');
    assert(colorSwatch, 'Should find a color swatch');
    
    const expectedColor = colorSwatch.dataset.hex;
    assert(expectedColor, 'Color swatch should have hex data');
    
    // Simulate click event with mock stopPropagation
    const clickEvent = { stopPropagation: () => {} };
    
    // Click the swatch
    colorSwatch.onclick(clickEvent);
    
    // Check that the block now has the color (normalize # prefix)
    const actualColor = mockBlock.color ? mockBlock.color.replace('#', '') : mockBlock.color;
    assert(actualColor === expectedColor, `Block should have color ${expectedColor}, got ${actualColor}`);
    
    // Clean up
    blocks.pop();
    selectedBlocks.clear();
});

test('Clear Swatch Click Removes Color', () => {
    // Create a mock block with color
    const mockBlock = {
        id: 'clear-test-block',
        text: 'Clear Test Block',
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        parentId: null,
        color: presetColors[2] // Give it a color initially
    };
    
    // Add to blocks and selection
    blocks.push(mockBlock);
    selectedBlocks.add(mockBlock);
    
    // Build HUD
    buildHud();
    
    // Verify block has color initially
    assert(mockBlock.color, 'Block should initially have a color');
    
    // Get the clear swatch
    const clearSwatch = colorHud.querySelector('.clear-swatch');
    assert(clearSwatch, 'Should find clear swatch');
    assert(clearSwatch.innerText === '×', 'Clear swatch should have × text');
    
    // Simulate click event with mock stopPropagation
    const clickEvent = { stopPropagation: () => {} };
    
    // Click the clear swatch
    clearSwatch.onclick(clickEvent);
    
    // Check that the block no longer has color
    assert(!mockBlock.color, 'Block should no longer have color after clear click');
    
    // Clean up
    blocks.pop();
    selectedBlocks.clear();
});

test('HUD Handles Multiple Selected Blocks', () => {
    // Create multiple mock blocks
    const mockBlock1 = {
        id: 'multi-test-1',
        text: 'Multi Test 1',
        x: 100, y: 100, width: 120, height: 60,
        parentId: null
    };
    const mockBlock2 = {
        id: 'multi-test-2',
        text: 'Multi Test 2',
        x: 250, y: 100, width: 120, height: 60,
        parentId: null,
        color: presetColors[1]
    };
    
    // Add to blocks and selection
    blocks.push(mockBlock1, mockBlock2);
    selectedBlocks.add(mockBlock1);
    selectedBlocks.add(mockBlock2);
    
    // Update HUD - should show and use first selected block for current color display
    updateColorHud();
    
    // Should be visible
    assert(!colorHud.classList.contains('hidden'), 'HUD should be visible with multiple blocks selected');
    
    // Clean up
    blocks.pop();
    blocks.pop();
    selectedBlocks.clear();
});

test('Color Assignment With Tree Structure', () => {
    // Create parent and child blocks
    const parentBlock = {
        id: 'parent-test',
        text: 'Parent Block',
        x: 100, y: 100, width: 120, height: 60,
        parentId: null
    };
    const childBlock = {
        id: 'child-test',
        text: 'Child Block',
        x: 150, y: 150, width: 120, height: 60,
        parentId: 'parent-test'
    };
    
    // Add to blocks
    blocks.push(parentBlock, childBlock);
    
    // Apply color tree starting from index 0
    assignColorsToTree(parentBlock, 0);
    
    // Check that parent and child have colors
    assert(parentBlock.color, 'Parent block should have color after assignColorsToTree');
    assert(childBlock.color, 'Child block should have color after assignColorsToTree');
    
    // Normalize color format for comparison (remove # if present)
    const actualParentColor = parentBlock.color ? parentBlock.color.replace('#', '') : parentBlock.color;
    assert(actualParentColor === presetColors[0], `Parent should have first preset color: ${presetColors[0]}, got ${actualParentColor}`);
    
    // Clean up
    blocks.pop();
    blocks.pop();
});

test('Clear Colors From Tree Structure', () => {
    // Create parent and child blocks with colors
    const parentBlock = {
        id: 'clear-parent-test',
        text: 'Clear Parent Block',
        x: 100, y: 100, width: 120, height: 60,
        parentId: null,
        color: presetColors[0]
    };
    const childBlock = {
        id: 'clear-child-test',
        text: 'Clear Child Block',
        x: 150, y: 150, width: 120, height: 60,
        parentId: 'clear-parent-test',
        color: presetColors[1]
    };
    
    // Add to blocks
    blocks.push(parentBlock, childBlock);
    
    // Verify they have colors initially
    assert(parentBlock.color, 'Parent should have color initially');
    assert(childBlock.color, 'Child should have color initially');
    
    // Clear colors from tree
    clearColorsFromTree(parentBlock);
    
    // Check that colors are cleared
    assert(!parentBlock.color, 'Parent block should not have color after clearColorsFromTree');
    assert(!childBlock.color, 'Child block should not have color after clearColorsFromTree');
    
    // Clean up
    blocks.pop();
    blocks.pop();
});

// Summary
console.log('\n🏁 HUD DOM Tests Completed!');
console.log(`Total tests: ${tests}`);
console.log(`Failures: ${failures}`);

if (failures === 0) {
    console.log('✅ All HUD tests passed!');
    process.exit(0);
} else {
    console.log('❌ Some tests failed.');
    process.exit(1);
}
