// Test script for Terraform Blockly Editor core functionality
const { app, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert');
const { ipcMain } = require('electron');

// Test results
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  failures: []
};

// Test function
function test(name, fn) {
  testResults.total++;
  try {
    fn();
    console.log(`✓ ${name}`);
    testResults.passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    testResults.failed++;
    testResults.failures.push({ name, error: error.message });
  }
}

// Main test function
async function runTests() {
  console.log('Running Terraform Blockly Editor tests...');
  
  // Create test window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../dist/preload.js')
    }
  });
  
  // Load the app
  await mainWindow.loadFile(path.join(__dirname, '../index.html'));
  
  // Wait for app to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test app initialization
  test('App should initialize correctly', () => {
    assert(mainWindow.webContents.getTitle() === 'Terraform Blockly Editor');
  });
  
  // Test Blockly workspace
  test('Blockly workspace should be created', async () => {
    const hasBlocklyWorkspace = await mainWindow.webContents.executeJavaScript(`
      !!document.getElementById('blocklyDiv').querySelector('.blocklyWorkspace')
    `);
    assert(hasBlocklyWorkspace);
  });
  
  // Test toolbox categories
  test('Toolbox should have required categories', async () => {
    const categories = await mainWindow.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.blocklyToolboxCategory')).map(el => el.getAttribute('aria-label'))
    `);
    assert(categories.includes('Core Resources'));
    assert(categories.includes('Modules'));
    assert(categories.includes('Feature Flags') || categories.includes('Values'));
  });
  
  // Test core blocks
  test('Core blocks should be available', async () => {
    // Click on Core Resources category
    await mainWindow.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.blocklyTreeLabel')).find(el => el.textContent === 'Core Resources').click()
    `);
    
    // Wait for blocks to appear
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if blocks are available
    const hasStorageBlock = await mainWindow.webContents.executeJavaScript(`
      !!document.querySelector('.blocklyFlyout').textContent.includes('Storage Account')
    `);
    assert(hasStorageBlock);
  });
  
  // Test code generation
  test('Code preview should show generated code', async () => {
    // Add a block to the workspace
    await mainWindow.webContents.executeJavaScript(`
      // Find the storage account block in the flyout
      const blocklyFlyout = document.querySelector('.blocklyFlyout');
      const storageBlock = Array.from(blocklyFlyout.querySelectorAll('.blocklyText'))
        .find(el => el.textContent.includes('Storage Account'))
        .closest('[data-id]');
      
      // Get the block ID
      const blockId = storageBlock.getAttribute('data-id');
      
      // Simulate dragging the block to the workspace
      Blockly.getMainWorkspace().paste(Blockly.Xml.blockToDom(Blockly.getMainWorkspace().getFlyout().getWorkspace().getBlockById(blockId)));
    `);
    
    // Wait for code generation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if code preview contains expected content
    const codePreview = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('generatedCode').textContent
    `);
    
    assert(codePreview.includes('resource') && codePreview.includes('Microsoft.Storage/storageAccounts'));
  });
  
  // Test environment switching
  test('Environment switching should update feature flags', async () => {
    // Select production environment
    await mainWindow.webContents.executeJavaScript(`
      const environmentSelector = document.getElementById('environmentSelector');
      environmentSelector.value = 'production';
      environmentSelector.dispatchEvent(new Event('change'));
    `);
    
    // Wait for environment change to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check console for environment change message
    const consoleOutput = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('consoleOutput').textContent
    `);
    
    assert(consoleOutput.includes('production environment'));
  });
  
  // Close the window
  mainWindow.close();
  
  // Print test summary
  console.log('\nTest Summary:');
  console.log(`Total: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  
  if (testResults.failed > 0) {
    console.log('\nFailures:');
    testResults.failures.forEach(failure => {
      console.log(`- ${failure.name}: ${failure.error}`);
    });
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run the app and tests
app.whenReady().then(runTests);

// Exit if all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});
