import { test, expect } from '@playwright/test';
import { getOrgaUser, getRegularUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';

test.describe('Login', () => {
  test('login with orga user and reach dashboard', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('span:has-text("Willkommen,")')).toBeVisible({ timeout: 5_000 });
  });

  test('login with regular user and reach dashboard', async ({ page }) => {
    const user = getRegularUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input[placeholder*="E-Mail"]', 'nonexistent@example.com');
    await page.fill('input[type="password"], input[placeholder*="Passwort"]', 'WrongPassword123!');
    await page.click('button:has-text("Anmelden")');
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

    await loginViaBrowser(page, user!.email, getFixtures().password);

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
    expect(token).toMatch(/^eyJ/);
  });

  test('authenticated user visiting / is redirected to dashboard', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await expect(page).toHaveURL(/dashboard/);

    // Navigate to root while still authenticated
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should land on dashboard, not login
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('span:has-text("Willkommen,")')).toBeVisible({ timeout: 5_000 });
  });
});
