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

// Per-test timeout: a wedged Electron window must fail the run instead of
// hanging CI until the job-level timeout kills it.
const TEST_TIMEOUT_MS = parseInt(process.env.TEST_TIMEOUT_MS || '180000', 10);
// Retries per test file to absorb nondeterministic Electron/GUI flakes in CI.
const MAX_ATTEMPTS = parseInt(process.env.TEST_ATTEMPTS || '2', 10);

// Results tracking
const results = {
  total: testFiles.length,
  passed: 0,
  failed: 0,
  failures: []
};

// Run one test file once. Resolves true on exit code 0, false otherwise
// (spawn error, non-zero exit, or timeout).
function attempt(testFile, attemptNo) {
  return new Promise((resolve) => {
    console.log(`\n=== Running ${testFile} (attempt ${attemptNo}/${MAX_ATTEMPTS}) ===\n`);

    const testPath = path.join(__dirname, testFile);
    // require('electron') from plain Node resolves to the Electron binary path,
    // which is cross-platform (dist/electron.exe on Windows, dist/electron elsewhere).
    let electronBinary;
    try {
      electronBinary = require('electron');
    } catch (err) {
      console.error(`✗ ${testFile}: cannot resolve Electron binary: ${err.message}`);
      resolve(false);
      return;
    }

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

    let settled = false;
    let child;
    try {
      child = spawn(command, args, { stdio: 'inherit' });
    } catch (err) {
      console.error(`✗ ${testFile}: failed to spawn ${command}: ${err.message}`);
      resolve(false);
      return;
    }

    const finish = (passed, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!passed && reason) {
        console.error(`✗ ${testFile} attempt ${attemptNo} failed: ${reason}`);
      }
      resolve(passed);
    };

    // Spawn errors (missing binary, missing xvfb-run, EACCES) must be
    // reported as failures instead of crashing the runner.
    child.on('error', (err) => {
      finish(false, `spawn error: ${err.message}`);
    });

    const timer = setTimeout(() => {
      console.error(`⏱ ${testFile} attempt ${attemptNo} exceeded ${TEST_TIMEOUT_MS}ms - killing`);
      try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
      finish(false, `timeout after ${TEST_TIMEOUT_MS}ms`);
    }, TEST_TIMEOUT_MS);

    child.on('close', (code) => {
      finish(code === 0, code === 0 ? null : `exit code ${code}`);
    });
  });
}

// Run one test file with retries.
async function runTest(testFile) {
  for (let attemptNo = 1; attemptNo <= MAX_ATTEMPTS; attemptNo++) {
    const passed = await attempt(testFile, attemptNo);
    if (passed) {
      results.passed++;
      console.log(`\n✓ ${testFile} passed\n`);
      return true;
    }
  }
  results.failed++;
  results.failures.push(testFile);
  console.log(`\n✗ ${testFile} failed after ${MAX_ATTEMPTS} attempt(s)\n`);
  return false;
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
