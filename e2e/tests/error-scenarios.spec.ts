import { test, expect } from '@playwright/test';
import { getOrgaUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { waitForEmail } from '../helpers/mailtm-checker';

test.describe('Error Scenarios', () => {
  test('wrong password shows error on login', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input[placeholder*="E-Mail"], input[placeholder*="e-mail"]', user!.email);
    await page.fill('input[type="password"], input[placeholder*="Passwort"], input[placeholder*="password"]', 'WrongPassword123!');
    await page.click('button:has-text("Anmelden")');
    await page.waitForTimeout(2000);

    // Should stay on login page (no dashboard redirect)
    expect(page.url()).not.toContain('/dashboard');

    // Should show an error toast (toastify)
    const toast = page.locator('.Toastify__toast--error, [class*="toast"][class*="error"]');
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('nonexistent email shows error on login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input[placeholder*="E-Mail"], input[placeholder*="e-mail"]', 'nobody@example.com');
    await page.fill('input[type="password"], input[placeholder*="Passwort"], input[placeholder*="password"]', 'Test1234!');
    await page.click('button:has-text("Anmelden")');
    await page.waitForTimeout(2000);

    // Should stay on login page
    expect(page.url()).not.toContain('/dashboard');

    // Should show an error toast
    const toast = page.locator('.Toastify__toast--error, [class*="toast"][class*="error"]');
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('empty credentials do not submit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click login without filling anything
    await page.click('button:has-text("Anmelden")');
    await page.waitForTimeout(1000);

    // Should not navigate away
    expect(page.url()).not.toContain('/dashboard');
  });

  test('test mail buttons disabled without content', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // Both send buttons should be disabled when fields are empty
    await expect(page.locator('button:has-text("Test-Mail senden")')).toBeDisabled();
    await expect(page.locator('button:has-text("Versenden")')).toBeDisabled();
  });

  test('bulk send button is disabled without content', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // The Versenden button should be disabled when fields are empty
    const sendButton = page.locator('button:has-text("Versenden")');
    await expect(sendButton).toBeDisabled();
  });

  test('regular user gets rejected on mail API', async ({ page }) => {
    const fixtures = getFixtures();
    const regularUser = fixtures.users.find(u => u.role !== 'orga');
    expect(regularUser).toBeTruthy();

    // Login as regular user
    await loginViaBrowser(page, regularUser!.email, fixtures.password);

    // Get auth token from localStorage and call mail API with it
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/mail/test-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject: 'Test', message: 'Test' }),
      });
      return { status: res.status, ok: res.ok };
    });

    expect(response.ok).toBe(false);
    expect([400, 401, 403]).toContain(response.status);
  });
});
