const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Array of test files to run
const testFiles = [
  'core-functionality.test.js',
  'module-analysis.test.js',
  'feature-flags.test.js',
  'cross-platform.test.js'
];

// Results tracking
const results = {
  total: testFiles.length,
  passed: 0,
  failed: 0,
  failures: []
};

// Function to run a test file
async function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n=== Running ${testFile} ===\n`);
    
    const testPath = path.join(__dirname, testFile);
    // require('electron') from plain Node resolves to the Electron binary path,
    // which is cross-platform (dist/electron.exe on Windows, dist/electron elsewhere).
    const electronBinary = require('electron');
    
    // Add flags for headless operation and CI environments
    const electronArgs = [
      testPath,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ];
    
    // Use xvfb-run on Linux for virtual display
    let command, args;
    if (process.platform === 'linux') {
      command = 'xvfb-run';
      args = ['-a', '--server-args=-screen 0 1024x768x24', electronBinary, ...electronArgs];
    } else {
      command = electronBinary;
      args = electronArgs;
    }
    
    const child = spawn(command, args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      const passed = code === 0;
      if (passed) {
        results.passed++;
        console.log(`\n✓ ${testFile} passed\n`);
      } else {
        results.failed++;
        results.failures.push(testFile);
        console.log(`\n✗ ${testFile} failed\n`);
      }
      resolve(passed);
    });
  });
}

// Run all tests sequentially
async function runAllTests() {
  console.log('=== Terraform Blockly Editor Test Suite ===\n');
  
  for (const testFile of testFiles) {
    await runTest(testFile);
  }
  
  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.failures.forEach(failure => {
      console.log(`- ${failure}`);
    });
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

// Run the tests
runAllTests();
