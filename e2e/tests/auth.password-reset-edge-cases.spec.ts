import { test, expect } from '@playwright/test';

test.describe('Password Reset Edge Cases', () => {
  test('mismatched passwords show an error and stay on the page', async ({ page }) => {
    await page.goto('/resetPassword?id=1&token=dummy');
    const resetUrl = page.url();
    await expect(page.locator('text=Passwort zurücksetzen')).toBeVisible({ timeout: 10_000 });

    await page.fill('#newpassword', 'NewPass123!');
    await page.fill('#confirmpassword', 'DifferentPass456!');
    await page.click('button:has-text("Passwort aktualisieren")');

    await expect(
      page.locator('text=Neues Passwort und Passwort bestätigen stimmen nicht überein!'),
    ).toBeVisible({ timeout: 5_000 });

    // Still on the reset page with id/token unchanged, not redirected
    await expect(page).toHaveURL(resetUrl);
  });

  test('invalid reset token shows an error', async ({ page }) => {
    await page.goto('/resetPassword?id=1&token=invalid-token');
    const resetUrl = page.url();
    await expect(page.locator('text=Passwort zurücksetzen')).toBeVisible({ timeout: 10_000 });

    await page.fill('#newpassword', 'NewPass123!');
    await page.fill('#confirmpassword', 'NewPass123!');
    await page.click('button:has-text("Passwort aktualisieren")');

    await expect(page.locator('text=Invalid or expired reset token')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(resetUrl);
  });

  test('back to login link returns to the login page', async ({ page }) => {
    await page.goto('/resetPassword');
    await expect(page.locator('text=Passwort zurücksetzen')).toBeVisible({ timeout: 10_000 });

    await page.locator('text=← Zurück zur Anmeldung').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible({ timeout: 10_000 });
  });
});
