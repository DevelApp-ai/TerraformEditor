# Security Posture

## Platforms

Terraform Blockly Editor supports two runtime platforms:

1. **Browser (GitHub Pages)** — a static web app with no server component.
2. **Electron (desktop)** — the packaged desktop application.

Both share the same renderer code through a platform abstraction
(`src/common/platform.ts`):

- `BrowserServices` (`src/common/browser-services.ts`): IndexedDB storage
  and GitHub REST API transport.
- `ElectronServices` (`src/common/electron-services.ts`): whitelisted IPC
  bridge to the Electron main process.

## Browser security

- **No secrets persisted**: GitHub PATs are provided per session, held in
  memory only, and never written to IndexedDB, `localStorage`, URLs, or logs.
- **Session-scoped storage**: projects and feature flags are stored in
  IndexedDB in the browser profile; closing the session ends token access.
  Tokens are never stored at all.
- **Content Security Policy**: the web build (`web/index.html`) ships a strict
  CSP: scripts only from `self`, `connect-src` limited to GitHub API.
- **No server**: everything runs client-side; GitHub Pages serves static
  assets only.

## Electron security

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
  (`src/main/main.ts`).
- The preload script exposes a narrow, channel-whitelisted `window.api`
  bridge (`src/renderer/preload.ts`).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Token theft via storage | Tokens kept in memory only, never persisted |
| XSS from malicious repo content | Terraform/OpenTofu file contents are rendered as text, strict CSP on web build |
| Token in URLs/logs | Bearer header only; URLs never contain tokens |
| Cross-site data leakage | CSP restricts `connect-src` to `api.github.com` |

## Reporting

Please use the bug report issue template (error sections are prefilled) and
never paste real tokens.
