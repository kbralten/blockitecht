// test.js
// Integration testing for Blockitecht

const fs = require('fs');
const path = require('path');

// Mock DOM environment for headless testing
async function runTests() {
    console.log("🚀 Starting Blockitecht Tests...");

    // 1. Load the application logic
    const indexPath = path.join(__dirname, 'index.html');
    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    
    // Extract application script
    // Locate logic script
    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    let match;
    let scripts = [];
    while ((match = scriptRegex.exec(htmlContent)) !== null) {
        scripts.push(match[1]);
    }
    const appScript = scripts[scripts.length - 1];

    // Execute in VM context
    // We need to mock document, window, localstorage etc.
    const mockWindow = {
        addEventListener: () => {},
        localStorage: { getItem: () => null, setItem: () => {} },
        requestAnimationFrame: () => {},
        mermaid: { 
            initialize: () => {},
            render: () => Promise.resolve({ svg: '' })
        }
    };
    
    const context = {
        window: mockWindow,
        localStorage: { getItem: () => null, setItem: () => {} },
        requestAnimationFrame: () => {}, // Add global mock
        mermaid: { 
            initialize: () => {},
            render: () => Promise.resolve({ svg: '' })
        },
        document: {
             getElementById: () => ({ 
                 getContext: () => ({ 
                    translate:()=>{}, save:()=>{}, restore:()=>{}, clearRect:()=>{},
                    beginPath:()=>{}, rect:()=>{}, roundRect:()=>{}, fill:()=>{}, stroke:()=>{},
                    fillText:()=>{}, moveTo:()=>{}, lineTo:()=>{} 
                 }),
                 parentElement: { clientWidth: 800, clientHeight: 600 },
                 value: "",
                 addEventListener: () => {} // Add this
             }),
             createElement: () => ({ style: {} })
        },
        console: console,
        navigator: {},
        module: { exports: {} } // For capturing exports
    };

    // Execute script in context
    const vm = require('vm');
    vm.createContext(context);
    
    try {
        vm.runInContext(appScript, context);
    } catch (e) {
        console.error("❌ Error loading application script:", e);
        return;
    }

    // Access exported functions
    const app = context.window.bte; 

    // --- TEST HELPERS ---
    function assert(condition, message) {
        if (!condition) {
            console.error(`❌ FAILED: ${message}`);
            process.exit(1);
        } else {
            console.log(`✅ ${message}`);
        }
    }

    // --- TEST 1: Basic Logic Existence ---
    assert(typeof app.state === 'object', "State object exists");
    
    // --- TEST 2: Generator Logic ---
    app.state.blocks = [
        { id: 'A', text: 'Alpha', row: 0, col: 0, rowSpan: 1, colSpan: 1, parentId: null },
        { id: 'B', text: 'Beta', row: 0, col: 2, rowSpan: 1, colSpan: 1, parentId: null }
    ];
    
    // Grid: A [space] B
    // Total columns: 3
    const output = app.generateMermaidBlockDiagram();
    console.log("Generated Output:\n", output);
    
    assert(output.includes('columns 3'), "Has correct columns count");
    assert(output.includes('Alpha'), "Has block A");
    assert(output.includes('space'), "Has space");
    assert(!output.includes('space:1'), "Single space is 'space' not 'space:1'");

    console.log("✅ Generator Test Passed");

    // --- TEST 3: Parser Logic ---
    const input = `block-beta
columns 3
A["Alpha"]
space
B["Beta"]:2`;
    
    app.parseBlockDiagramInput(input);
    
    const blockA = app.state.blocks.find(b => b.id === 'A');
    const blockB = app.state.blocks.find(b => b.id === 'B');
    
    assert(blockA, "Parsed Block A");
    assert(blockA.col === 0 && blockA.row === 0, "Block A is at 0,0");
    assert(blockB, "Parsed Block B");
    assert(blockB.col === 2, `Block B is at col 2 (after space at col 1). Got ${blockB.col}`);
    assert(blockB.colSpan === 2, "Block B has width 2");

    console.log("✅ Parser Test Passed");

    console.log("🎉 All tests passed!");
}

runTests();
