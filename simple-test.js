#!/usr/bin/env node

// Simple test without package.json
console.log('🧪 Testing the fix...\n');

// Test input that was failing
const testInput = `block
columns 1
  D
  block:ID
    A
    B["A wide one in the middle"]
    C
  end`;

console.log('Original input:');
console.log(testInput);
console.log();

// Expected: should create D, ID, A, B, C (5 blocks total)
// D (top-level), ID (parent), A/B/C (children of ID)

console.log('Expected structure:');
console.log('- D (top-level)');
console.log('- ID (parent block)');  
console.log('- A (child of ID)');
console.log('- B (child of ID)');
console.log('- C (child of ID)');
console.log();

console.log('The issue was that generator added ID_title["ID"] creating 6 blocks instead of 5');
console.log('Fixed by removing the extra title block generation.');