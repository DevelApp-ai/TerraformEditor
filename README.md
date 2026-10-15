# Terraform-Editor

Terraform/OpenTofu Editor with Blockly Module Integration - A visual editor for Terraform code.

A visual programming environment for creating and managing Terraform/OpenTofu configurations. It leverages Google's Blockly framework to provide a drag-and-drop interface for working with Terraform modules, with a focus on analyzing module variables and outputs.

## Key Features

- **Visual Terraform Editing**: Create HCL configurations using a drag-and-drop interface
- **Module Analysis**: Analyze Terraform modules from git repositories to extract variables and outputs
- **Git Integration**: Pull in modules from git repositories (e.g. GitHub) as blocks
- **Dual Platform**: Runs both as an Electron desktop app (published via GitHub Releases) and as a static web app served from GitHub Pages
- **Browser-Only Persistence**: In the web build, all data persists in the browser session only (IndexedDB); GitHub PATs are held in memory and never persisted
- **Feature Flags**: Configure different environments with environment-specific settings
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Platforms

| Platform | Delivery | Persistence |
| --- | --- | --- |
| Browser (GitHub Pages) | Static bundle deployed on push to `main` | IndexedDB in the browser session; tokens in memory only |
| Electron (desktop) | Installers published to GitHub Releases on `v*` tags | Local app data directory |

## Getting Started

### Web (GitHub Pages)

Open the deployed site at `https://<owner>.github.io/TerraformEditor/`.

### Desktop (Electron)

Download the appropriate installer for your platform from the releases page:

- **Windows**: `Terraform-Blockly-Editor-Setup-x.x.x.exe`
- **macOS**: `Terraform-Blockly-Editor-x.x.x.dmg`
- **Linux**: `Terraform-Blockly-Editor-x.x.x.AppImage`

## Development

### Prerequisites

- Node.js (v22.12 or later)
- npm
- Git

### Setup

```bash
git clone https://github.com/DevelApp-ai/TerraformEditor.git
cd TerraformEditor
npm install
```

### Build

```bash
npm run build        # Electron build
npm run build:web    # Static web bundle for GitHub Pages
```

### Test

```bash
npm run test:web     # Unit tests (plain Node, no Electron)
npm test             # Electron test suite (needs a display or xvfb)
npx playwright test  # End-to-end tests (headless Chromium)
```

All quality gates treat warnings as errors: strict TypeScript, ESLint `--max-warnings 0`, prettier checks, `npm audit --audit-level=high`, and a production webpack build with an enforced bundle-size ceiling.

### Project Structure

```
├── src/
│   ├── main/           # Main Electron process
│   ├── renderer/       # Renderer process (UI)
│   └── common/         # Shared code and types
├── tests/
│   ├── unit/           # Node-runnable unit tests
│   └── e2e/            # Playwright end-to-end tests
├── web/                # Source-controlled static web entry (index.html)
├── docs/               # Documentation
└── .github/workflows/  # CI/CD pipelines
```

## Documentation

- [Security Posture](docs/security.md): Threat model, CSP, token handling
