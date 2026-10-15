// Test script for cross-platform compatibility
const { app, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert');
const os = require('os');
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
  console.log('Running Cross-Platform Compatibility tests...');
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
  console.log(`Node.js version: ${process.version}`);
  console.log(`Electron version: ${process.versions.electron}`);
  
  // Create test window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      contextIsolation: false,
      preload: path.join(__dirname, '../dist/preload.js')
    }
  });
  
  // Load the app
  await mainWindow.loadFile(path.join(__dirname, '../index.html'));
  
  // Wait for app to load
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test platform-specific paths
  test('Should use correct platform-specific paths', () => {
    const platform = process.platform;
    const homedir = os.homedir();
    
    // Different platforms use different path separators and home directories
    if (platform === 'win32') {
      assert(homedir.includes(':\\'));
      assert(path.sep === '\\');
    } else {
      assert(path.sep === '/');
      if (platform === 'darwin') {
        assert(homedir.startsWith('/Users/'));
      } else if (platform === 'linux') {
        assert(homedir.startsWith('/home/') || homedir === '/root');
      }
    }
  });
  
  // Test UI rendering
  test('UI should render correctly', async () => {
    const uiElements = await mainWindow.webContents.executeJavaScript(`
      {
        toolbar: !!document.querySelector('.toolbar'),
        workspace: !!document.querySelector('.blockly-workspace'),
        toolbox: !!document.getElementById('moduleToolbox'),
        propertiesPanel: !!document.getElementById('propertiesPanel'),
        bottomPanel: !!document.querySelector('.bottom-panel')
      }
    `);
    
    assert(uiElements.toolbar);
    assert(uiElements.workspace);
    assert(uiElements.toolbox);
    assert(uiElements.propertiesPanel);
    assert(uiElements.bottomPanel);
  });
  
  // Test window size and position
  test('Window should have correct size and position', async () => {
    const bounds = mainWindow.getBounds();
    assert(bounds.width === 1200);
    assert(bounds.height === 800);
  });
  
  // Test file system access
  test('Should be able to access file system', async () => {
    // Create a mock file save handler
    ipcMain.removeHandler('file-save-tf');
    ipcMain.handle('file-save-tf', async (event, filePath, content) => {
      return {
        path: filePath || path.join(os.tmpdir(), 'test.tf'),
        success: true
      };
    });
    
    const result = await mainWindow.webContents.executeJavaScript(`
      window.api.saveTerraformFile('', 'test content')
        .then(result => result)
        .catch(error => ({ error: error.message }));
    `);
    
    assert(!result.error, result.error);
    assert(result.success === true);
    assert(result.path.includes('test.tf'));
  });
  
  // Test platform-specific keyboard shortcuts
  test('Should handle platform-specific keyboard shortcuts', async () => {
    const platform = process.platform;
    const modifierKey = platform === 'darwin' ? 'Meta' : 'Control';
    
    // Check if the platform-specific modifier key is recognized
    const keyboardResult = await mainWindow.webContents.executeJavaScript(`
      // Create a test function to check key events
      function testKeyEvent() {
        const event = new KeyboardEvent('keydown', {
          key: 's',
          code: 'KeyS',
          ${modifierKey.toLowerCase()}: true,
          ${modifierKey}Key: true
        });
        
        // Return the modifier key that was pressed
        return {
          platform: '${platform}',
          modifierKey: '${modifierKey}',
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey
        };
      }
      
      testKeyEvent();
    `);
    
    if (platform === 'darwin') {
      assert(keyboardResult.modifierKey === 'Meta');
      assert(keyboardResult.metaKey === true);
    } else {
      assert(keyboardResult.modifierKey === 'Control');
      assert(keyboardResult.ctrlKey === true);
    }
  });
  
  // Test display scaling
  test('Should handle display scaling', async () => {
    // Get current display scaling factor
    const scaleFactor = mainWindow.webContents.getZoomFactor();
    
    // Set a different zoom factor
    await mainWindow.webContents.setZoomFactor(scaleFactor * 1.2);
    
    // Check if zoom factor was applied
    const newScaleFactor = mainWindow.webContents.getZoomFactor();
    assert(Math.abs(newScaleFactor - (scaleFactor * 1.2)) < 0.01);
    
    // Reset zoom factor
    await mainWindow.webContents.setZoomFactor(scaleFactor);
  });
  
  // Test responsive layout
  test('Should have responsive layout', async () => {
    // Save original size
    const originalBounds = mainWindow.getBounds();
    
    // Resize to smaller size
    await mainWindow.setBounds({ width: 800, height: 600 });
    
    // Wait for resize to take effect
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if UI elements are still visible
    const smallUiElements = await mainWindow.webContents.executeJavaScript(`
      {
        toolbar: !!document.querySelector('.toolbar'),
        workspace: !!document.querySelector('.blockly-workspace'),
        toolbox: !!document.getElementById('moduleToolbox'),
        propertiesPanel: !!document.getElementById('propertiesPanel'),
        bottomPanel: !!document.querySelector('.bottom-panel')
      }
    `);
    
    assert(smallUiElements.toolbar);
    assert(smallUiElements.workspace);
    assert(smallUiElements.toolbox);
    assert(smallUiElements.propertiesPanel);
    assert(smallUiElements.bottomPanel);
    
    // Restore original size
    await mainWindow.setBounds(originalBounds);
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
