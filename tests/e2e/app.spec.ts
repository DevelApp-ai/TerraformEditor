import { test, expect } from '@playwright/test';

test('app loads from static bundle served under Pages subpath', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Terraform Blockly Editor');
  await expect(page.locator('#blocklyDiv')).toBeVisible();
});

test('no CSP violations during load', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });
  await page.goto('/');
  await expect(page.locator('#blocklyDiv')).toBeVisible();
  expect(violations).toEqual([]);
});

async function countStoredProjects(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const request = indexedDB.open('terraform-blockly-editor');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('projects')) {
            resolve(0);
            return;
          }
          const tx = db.transaction('projects', 'readonly');
          const getAll = tx.objectStore('projects').getAll();
          getAll.onsuccess = () => resolve((getAll.result ?? []).length);
          getAll.onerror = () => resolve(0);
        };
        request.onerror = () => resolve(0);
      })
  );
}

test('project persists across reload within the session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#blocklyDiv')).toBeVisible();

  // Saving from the toolbar writes a project record via the platform services.
  await page.click('#saveFile');
  await expect
    .poll(() => countStoredProjects(page), { timeout: 10000 })
    .toBeGreaterThanOrEqual(1);

  // Data persists in the browser session across reloads (no server involved).
  await page.reload();
  await expect(page.locator('#blocklyDiv')).toBeVisible();
  await expect
    .poll(() => countStoredProjects(page), { timeout: 10000 })
    .toBeGreaterThanOrEqual(1);
});

test('no token-like values persisted to storage', async ({ page }) => {
  await page.goto('/');
  const serialized = await page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const request = indexedDB.open('terraform-blockly-editor');
        request.onsuccess = () => {
          const db = request.result;
          const storeNames = [...db.objectStoreNames];
          if (storeNames.length === 0) {
            resolve('[]');
            return;
          }
          const chunks: string[] = [];
          let pending = storeNames.length;
          for (const name of storeNames) {
            const tx = db.transaction(name, 'readonly');
            const getAll = tx.objectStore(name).getAll();
            getAll.onsuccess = () => {
              chunks.push(JSON.stringify(getAll.result ?? []));
              pending -= 1;
              if (pending === 0) {
                resolve(chunks.join(','));
              }
            };
            getAll.onerror = () => {
              pending -= 1;
              if (pending === 0) {
                resolve(chunks.join(','));
              }
            };
          }
        };
        request.onerror = () => resolve('[]');
      })
  );
  expect(serialized).not.toContain('ghp_');
  expect(serialized).not.toContain('Bearer ');
});
