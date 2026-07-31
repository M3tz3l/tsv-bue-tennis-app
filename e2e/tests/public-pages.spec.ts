import { test, expect } from '@playwright/test';

const impressumUrl = /\/impressum\/?(?:[?#].*)?$/;
const datenschutzUrl = /\/datenschutz\/?(?:[?#].*)?$/;

test.describe('Public Pages', () => {
  test('Impressum is reachable from the footer and renders content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible({ timeout: 10_000 });

    await page.locator('footer >> text=Impressum').click();
    await expect(page).toHaveURL(impressumUrl);

    await expect(page.locator('h1:has-text("Impressum")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=TSV Bad Überkingen 1889 e.V.').first()).toBeVisible();
    await expect(page.locator('text=admin@tsv-bue-tennis.de')).toBeVisible();
  });

  test('Datenschutz is reachable from the footer and renders content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible({ timeout: 10_000 });

    await page.locator('footer >> text=Datenschutz').click();
    await expect(page).toHaveURL(datenschutzUrl);

    await expect(page.locator('h1:has-text("Datenschutzerklärung")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Hetzner Online GmbH').first()).toBeVisible();
    await expect(page.locator('text=admin@tsv-bue-tennis.de').first()).toBeVisible();
  });

  test('public pages are accessible without authentication', async ({ page }) => {
    await page.goto('/impressum');
    await expect(page.locator('h1:has-text("Impressum")')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(impressumUrl);

    await page.goto('/datenschutz');
    await expect(page.locator('h1:has-text("Datenschutzerklärung")')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(datenschutzUrl);
  });
});
