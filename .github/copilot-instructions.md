# Copilot Instructions for Mermaid Block Diagram Architect

## Repository Overview

This is a **single-file web application** that provides a visual editor for creating Mermaid block diagrams. The project is a client-side tool with **zero build dependencies** and **no framework requirements**.

- **Project Size**: Small (~1,100 lines in main file)
- **Type**: Static HTML/CSS/JavaScript web application
- **Languages**: HTML5, CSS3, vanilla JavaScript (ES6+)
- **Target Runtime**: Modern web browsers
- **Dependencies**: None (uses only browser APIs)

## Architecture & Project Structure

```
blockitecht/
├── blockitecht.html          # Main application (all code in one file)
├── README.md                 # Project documentation
├── tests/
│   ├── parseHarness.js      # Parser unit tests (requires jsdom)
│   └── snippet.html         # Test HTML fixture
├── test.js                  # Round-trip integration tests  
├── simple-test.js           # Basic test script
└── .vscode/
    └── launch.json          # VS Code debug configuration
```

### Key Application Components (all in blockitecht.html)

1. **Visual Canvas System** (lines 300-500)
   - Canvas-based drawing with 20px grid
   - Block creation, resizing, dragging
   - Parent/child block relationships
   - Mouse interaction handling

2. **Mermaid Parser/Generator** (lines 500-800)
   - `parseBlockDiagramInput()`: Parses Mermaid syntax → internal blocks
   - `generateMermaidBlockDiagram()`: Converts blocks → Mermaid syntax
   - Supports columns, nesting, connections, spaces
   - **Must conform to Mermaid block-beta syntax** See [the mermaid docs](https://docs.mermaidchart.com/mermaid-oss/syntax/block.html)

3. **UI Components** (lines 100-250)
   - Dual-panel layout (canvas + output)
   - Title input, load/save modals
   - Real-time Mermaid output panel

## Build & Development Instructions

**CRITICAL**: This project requires **NO build process** and has **NO package.json**.

### Development Setup

1. **Start HTTP Server** (REQUIRED for file loading):
   ```bash
   python -m http.server 8000
   ```
   - Always use HTTP server (not file:// protocol)
   - Default port 8000 works well
   - Server must stay running during development

2. **Open Application**:
   ```
   http://localhost:8000/blockitecht.html
   ```

### Testing

**Round-trip Integration Tests** (PREFERRED):
```bash
node test.js
```
- Tests Mermaid parsing → generation → re-parsing
- No dependencies required
- Always run after parser changes
- Expected output: "✅ Round-trip successful!" for all tests

**Parser Unit Tests** (Requires setup):
```bash
# First install jsdom (only if running parseHarness.js):
npm install jsdom
node tests/parseHarness.js
```
- Tests HTML table parsing specifically
- Only run if modifying legacy HTML parsing code
- Skip if no npm/Node.js environment available

### Validation Steps

1. **Visual Testing** (ALWAYS do this):
   - Open application in browser
   - Create blocks on canvas by click-dragging
   - Verify Mermaid output appears in right panel
   - Test "Load from Mermaid" with sample diagrams

2. **Built-in Test Suite**:
   - Click "🧪 Run Tests" button (top-right corner)
   - Check browser console (F12) for detailed results
   - All tests should show "✅ Round-trip successful!"

3. **Cross-browser Testing**:
   - Primary target: Chrome/Edge (uses modern Canvas API)
   - Firefox and Safari should also work
   - IE not supported (uses ES6+ features)

## Development Workflow

### Making Changes

1. **Edit blockitecht.html directly** (all code is in this file)
2. **Refresh browser** to see changes
3. **Test immediately** using built-in test button
4. **Run integration tests**: `node test.js`

### Common Pitfalls & Workarounds

1. **File Protocol Issues**:
   - NEVER use `file://` URLs
   - ALWAYS use HTTP server (`python -m http.server 8000`)
   - Required for proper CORS handling

2. **Test Dependencies**:
   - `test.js` works without dependencies
   - `tests/parseHarness.js` requires `npm install jsdom`
   - Don't create package.json unless necessary

3. **Canvas Coordinate System**:
   - Uses 20px grid snapping
   - Block positions are absolute pixel coordinates
   - Parent blocks contain children with relative positioning

## Development Process Guidelines

### Defect Resolution
- When dealing with a defect or unwanted behaviour:
  1. First, write a test in `test.js` to replicate the issue.
  2. Prove the test fails, confirming the defect.
  3. Implement the fix and ensure the test passes.

### Feature Development
- When adding a new feature:
  1. First, write a test in `test.js` that will fail.
  2. Write the functional code to implement the feature.
  3. Ensure the test passes after implementation.

### Round-Trip Validation
- For features that aren't purely UI-related:
  - Add a test to `test.js` to validate the feature "round trips" through the generator and parser.

### Final Validation
- After making changes:
  1. Run a linter pass and validate there are no warnings.
  2. Run `test.js` and ensure all tests pass.

### Key Code Areas

**Parser Functions** (lines 739-890):
- `parseBlockDiagramInput()`: Handles columns, nesting, spaces
- Column-aware positioning based on `columns N` directive
- Grid layout for proper block spacing

**Generator Functions** (lines 512-670):
- `generateMermaidBlockDiagram()`: Outputs canonical Mermaid syntax
- Preserves spatial relationships through column analysis
- Handles parent/child nesting with `block:ID...end` syntax

**Canvas Interaction** (lines 300-460):
- Mouse event handlers for drag/drop/resize
- Block selection and context menus
- Real-time Mermaid output updates

## File Contents Reference

### blockitecht.html Structure
- Lines 1-100: HTML structure and CSS styles
- Lines 100-250: JavaScript initialization and DOM setup  
- Lines 250-300: Helper functions and utilities
- Lines 300-500: Canvas drawing and interaction
- Lines 500-700: Mermaid generation and parsing
- Lines 700-900: Block management and positioning
- Lines 900-1100: Event handlers and modal logic

### test.js (Integration Tests)
- 6 comprehensive test cases
- Tests round-trip parsing reliability
- No external dependencies
- Always run after parser changes

### README.md
- End-user documentation
- Usage examples with Mermaid syntax
- Links to Mermaid documentation

## Trust These Instructions

**IMPORTANT**: These instructions are comprehensive and tested. Only perform additional exploration if:
- You encounter errors not documented here
- You need to understand code not covered in this guide
- These instructions are found to be incorrect or incomplete

For typical development tasks (UI changes, parser fixes, feature additions), everything you need is documented above.

### Test File Organization

- **Comprehensive Tests**: The top-level `test.js` file is reserved for the comprehensive test suite that validates the entire application.
- **One-Off Tests**: Always create new one-off or feature-specific tests in the `/tests/` folder. This keeps the top-level directory clean and ensures all smaller tests are organized in one place.
- **Naming Convention**: Use descriptive names for one-off test files, e.g., `test-feature-name.js`, to clearly indicate their purpose.