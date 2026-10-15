import * as Blockly from 'blockly';
import { BrowserServices } from '../common/browser-services';
import { ElectronServices } from '../common/electron-services';
import { AppError, PlatformServices, ProjectRecord } from '../common/platform';

/**
 * Resolve the platform service layer at runtime:
 * - Browser (GitHub Pages): IndexedDB storage + GitHub API Git transport.
 * - Electron: whitelisted IPC bridge to the main process.
 */
async function resolveServices(): Promise<PlatformServices> {
  const api = (globalThis as { api?: unknown }).api;
  if (api) {
    return new ElectronServices();
  }
  const browserServices = new BrowserServices();
  await browserServices.initialize();
  return browserServices;
}

const servicesPromise: Promise<PlatformServices> = resolveServices();

async function withServices<T>(operation: (services: PlatformServices) => Promise<T>): Promise<T> {
  const services = await servicesPromise;
  try {
    return await operation(services);
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            'ERR_UNKNOWN',
            error instanceof Error ? error.message : String(error),
            services.platform,
            error
          );
    console.error(`[${appError.code}] ${appError.message}`);
    throw appError;
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeBlockly();
  setupEventListeners();
  setupTabSwitching();
});

// Initialize Blockly workspace
function initializeBlockly() {
  const toolbox = {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Core Resources',
        colour: '#5C81A6',
        contents: [],
      },
      {
        kind: 'category',
        name: 'Modules',
        colour: '#5CA65C',
        contents: [],
      },
      {
        kind: 'category',
        name: 'Feature Flags',
        colour: '#A65C81',
        contents: [],
      },
    ],
  };

  const workspace = Blockly.inject('blocklyDiv', {
    toolbox: toolbox,
    // Serve Blockly media (sprites/sounds) from the app origin; the default
    // CDN host would be blocked by the strict CSP.
    media: new URL('media/', document.baseURI).toString(),
    grid: {
      spacing: 20,
      length: 3,
      colour: '#ccc',
      snap: true,
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 1.0,
      maxScale: 3,
      minScale: 0.3,
      scaleSpeed: 1.2,
    },
    trashcan: true,
  });

  workspace.addChangeListener(() => {
    updateCodePreview();
  });
}

// Update the code preview panel with generated Terraform (HCL) code
function updateCodePreview() {
  const code =
    'variable "storage_account_name" {\n  type = string\n}\n\nresource "azurerm_storage_account" "storage" {\n  name = var.storage_account_name\n  account_tier = "Standard"\n  account_replication_type = "LRS"\n}';
  const codePreview = document.getElementById('generatedCode');
  if (codePreview) {
    codePreview.textContent = code;
  }
}

// Set up event listeners for UI elements
function setupEventListeners() {
  const newFileButton = document.getElementById('newFile');
  if (newFileButton) {
    newFileButton.addEventListener('click', () => {
      const workspace = Blockly.getMainWorkspace();
      workspace.clear();
    });
  }

  const openFileButton = document.getElementById('openFile');
  if (openFileButton) {
    openFileButton.addEventListener('click', () => {
      void withServices(async services => {
        const result = await services.openTerraformFile();
        if (result) {
          const codePreview = document.getElementById('generatedCode');
          if (codePreview) {
            codePreview.textContent = result.content;
          }
        }
      });
    });
  }

  const saveFileButton = document.getElementById('saveFile');
  if (saveFileButton) {
    saveFileButton.addEventListener('click', () => {
      void withServices(async services => {
        const codePreview = document.getElementById('generatedCode');
        const content = codePreview?.textContent ?? '';
        const project: ProjectRecord = {
          id: `project-${Date.now()}`,
          name: 'main',
          content,
          updatedAt: Date.now(),
        };
        await services.saveProject(project);
        await services.saveTerraformFile('main.tf', content);
      });
    });
  }

  const environmentSelector = document.getElementById(
    'environmentSelector'
  ) as HTMLSelectElement | null;
  if (environmentSelector) {
    environmentSelector.addEventListener('change', () => {
      const environment = environmentSelector.value;
      void withServices(async services => {
        const flags = await services.loadFeatureFlags(environment);
        console.log(`Loaded feature flags for ${environment}:`, flags);
      });
    });
  }
}

// Set up tab switching in the bottom panel
function setupTabSwitching() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      if (tabId) {
        const tabContent = document.getElementById(tabId);
        if (tabContent) {
          tabContent.classList.add('active');
        }
      }
    });
  });
}
