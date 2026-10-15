// Test script for Terraform module analysis functionality
const { app, BrowserWindow } = require('electron');
const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
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

// Create a temporary Terraform module for testing
function createTestModule() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-test-'));
  const modulePath = path.join(tempDir, 'storage.tf');
  
  const moduleContent = `
// Storage Account module
param storageAccountName string
param location string = resourceGroup().location
param sku string = 'Standard_LRS'
param kind string = 'StorageV2'

resource storageAccount 'Microsoft.Storage/storageAccounts@2021-04-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: sku
  }
  kind: kind
}

output storageAccountId string = storageAccount.id
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
`;

  fs.writeFileSync(modulePath, moduleContent);
  
  // Create a git repository
  execSync('git init', { cwd: tempDir });
  execSync('git config --local user.email "test@example.com"', { cwd: tempDir });
  execSync('git config --local user.name "Test User"', { cwd: tempDir });
  execSync('git add .', { cwd: tempDir });
  execSync('git commit -m "Initial commit"', { cwd: tempDir });
  
  return { tempDir, modulePath };
}

// Main test function
async function runTests() {
  console.log('Running Terraform Module Analysis tests...');
  
  // Create test module and repository
  const { tempDir, modulePath } = createTestModule();
  console.log(`Created test module at ${modulePath}`);
  
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
  
  // Mock the git-add-repository IPC handler
  ipcMain.removeHandler('git-add-repository');
  ipcMain.handle('git-add-repository', async (event, repoUrl, branch, auth) => {
    // For testing, we'll use the local repository we created
    return {
      id: 'test-repo',
      name: 'test-repo',
      modules: 1
    };
  });
  
  // Mock the module-analyze IPC handler
  ipcMain.removeHandler('module-analyze');
  ipcMain.handle('module-analyze', async (event, modulePath) => {
    // Return mock module metadata based on our test module
    return {
      moduleName: 'storage',
      moduleSource: 'test-repo',
      modulePath: '/storage.tf',
      description: 'Storage Account module',
      parameters: [
        {
          name: 'storageAccountName',
          type: 'string',
          required: true
        },
        {
          name: 'location',
          type: 'string',
          required: false,
          defaultValue: 'resourceGroup().location'
        },
        {
          name: 'sku',
          type: 'string',
          required: false,
          defaultValue: 'Standard_LRS'
        },
        {
          name: 'kind',
          type: 'string',
          required: false,
          defaultValue: 'StorageV2'
        }
      ],
      outputs: [
        {
          name: 'storageAccountId',
          type: 'string',
          value: 'storageAccount.id'
        },
        {
          name: 'blobEndpoint',
          type: 'string',
          value: 'storageAccount.properties.primaryEndpoints.blob'
        }
      ],
      resources: [
        {
          type: 'Microsoft.Storage/storageAccounts',
          apiVersion: '2021-04-01'
        }
      ],
      lastUpdated: new Date().toISOString()
    };
  });
  
  // Mock the module-list IPC handler
  ipcMain.removeHandler('module-list');
  ipcMain.handle('module-list', async (event, repoId) => {
    // Return mock module list
    return [
      {
        id: 'storage',
        name: 'storage',
        path: '/storage.tf',
        parameters: 4,
        outputs: 2
      }
    ];
  });
  
  // Test adding a repository
  test('Should be able to add a git repository', async () => {
    const result = await mainWindow.webContents.executeJavaScript(`
      window.api.addRepository('${tempDir}', 'main', { type: 'none' })
        .then(result => result)
        .catch(error => ({ error: error.message }));
    `);
    
    assert(!result.error, result.error);
    assert(result.id === 'test-repo');
    assert(result.modules === 1);
  });
  
  // Test listing modules
  test('Should be able to list modules from repository', async () => {
    const modules = await mainWindow.webContents.executeJavaScript(`
      window.api.listModules('test-repo')
        .then(modules => modules)
        .catch(error => ({ error: error.message }));
    `);
    
    assert(!modules.error, modules.error);
    assert(Array.isArray(modules));
    assert(modules.length === 1);
    assert(modules[0].name === 'storage');
  });
  
  // Test analyzing a module
  test('Should be able to analyze a module', async () => {
    const moduleMetadata = await mainWindow.webContents.executeJavaScript(`
      window.api.analyzeModule('/storage.tf')
        .then(metadata => metadata)
        .catch(error => ({ error: error.message }));
    `);
    
    assert(!moduleMetadata.error, moduleMetadata.error);
    assert(moduleMetadata.moduleName === 'storage');
    assert(moduleMetadata.parameters.length === 4);
    assert(moduleMetadata.outputs.length === 2);
    assert(moduleMetadata.resources.length === 1);
  });
  
  // Test creating a module block
  test('Should be able to create a module block', async () => {
    // Add module block to the editor
    await mainWindow.webContents.executeJavaScript(`
      const moduleMetadata = {
        moduleName: 'storage',
        moduleSource: 'test-repo',
        modulePath: '/storage.tf',
        description: 'Storage Account module',
        parameters: [
          {
            name: 'storageAccountName',
            type: 'string',
            required: true
          },
          {
            name: 'location',
            type: 'string',
            required: false,
            defaultValue: 'resourceGroup().location'
          }
        ],
        outputs: [
          {
            name: 'storageAccountId',
            type: 'string',
            value: 'storageAccount.id'
          }
        ],
        resources: [
          {
            type: 'Microsoft.Storage/storageAccounts',
            apiVersion: '2021-04-01'
          }
        ],
        lastUpdated: new Date().toISOString()
      };
      
      // Access the editor instance
      const editorInstance = window.tfBlocklyEditor;
      if (editorInstance && editorInstance.addModuleBlock) {
        editorInstance.addModuleBlock(moduleMetadata);
        return true;
      } else {
        // Fallback: Create block definition directly
        const TerraformBlockFactory = window.TerraformBlockFactory;
        if (TerraformBlockFactory) {
          const blockDef = TerraformBlockFactory.createModuleBlockDefinition(moduleMetadata);
          TerraformBlockFactory.registerModuleBlock(blockDef);
          return true;
        }
        return false;
      }
    `);
    
    // Check if module category exists
    const hasModuleCategory = await mainWindow.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.blocklyTreeLabel')).some(el => el.textContent === 'Modules')
    `);
    
    assert(hasModuleCategory);
  });
  
  // Close the window
  mainWindow.close();
  
  // Clean up test repository
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Removed test directory ${tempDir}`);
  } catch (error) {
    console.error(`Failed to remove test directory: ${error.message}`);
  }
  
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
