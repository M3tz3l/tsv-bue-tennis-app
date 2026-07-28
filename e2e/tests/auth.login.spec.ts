import { test, expect } from '@playwright/test';
import { getOrgaUser, getRegularUser, getFixtures } from '../helpers/auth-helper';

async function loginViaForm(page: any, email: string, password: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"], input[placeholder*="E-Mail"], input[placeholder*="e-mail"]', email);
  await page.fill('input[type="password"], input[placeholder*="Passwort"], input[placeholder*="password"]', password);
  await page.click('button:has-text("Anmelden")');
}

test.describe('Login', () => {
  test('login with orga user and reach dashboard', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaForm(page, user!.email, getFixtures().password);
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('span:has-text("Willkommen,")')).toBeVisible({ timeout: 5_000 });
  });

  test('login with regular user and reach dashboard', async ({ page }) => {
    const user = getRegularUser();
    expect(user).toBeTruthy();

    await loginViaForm(page, user!.email, getFixtures().password);
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await loginViaForm(page, 'nonexistent@example.com', 'WrongPassword123!');
    await page.waitForTimeout(2000);

    // Should stay on login page
    expect(page.url()).not.toContain('/dashboard');

    // Should show an error toast
    const toast = page.locator('.Toastify__toast--error, [class*="toast"][class*="error"]');
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('JWT token is stored after login', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaForm(page, user!.email, getFixtures().password);
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
    expect(token).toMatch(/^eyJ/);
  });
});
