import { test, expect } from '@playwright/test';
import { getOrgaUser, getFixtures } from '../helpers/auth-helper';
import { waitForEmail } from '../helpers/mailtm-checker';

test.describe('Password Reset', () => {
  test('forgot password sends reset email', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();
    expect(user!.mailTmToken).toBeTruthy();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click "Passwort zurücksetzen"
    await page.click('text=Passwort zurücksetzen');
    await page.waitForTimeout(500);

    // Fill email
    await page.fill('input[type="email"], input[placeholder*="E-Mail"]', user!.email);

    // Submit
    await page.click('button:has-text("Senden"), button:has-text("Zurücksetzen")');

    // Should show success message
    await expect(page.locator('text=E-Mail gesendet, text=Link gesendet, text=Erfolgreich')).toBeVisible({ timeout: 5_000 });

    // Check mail.tm for the reset email
    const email = await waitForEmail(user!.mailTmToken!, /passwort|reset/i, 30_000);
    expect(email).toBeTruthy();
    expect(email!.from.address).toContain('tennisabteilung');
  });

  test('reset password link works and allows new login', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();
    expect(user!.mailTmToken).toBeTruthy();

    // First, request password reset
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('text=Passwort zurücksetzen');
    await page.waitForTimeout(500);
    await page.fill('input[type="email"], input[placeholder*="E-Mail"]', user!.email);
    await page.click('button:has-text("Senden"), button:has-text("Zurücksetzen")');
    await expect(page.locator('text=E-Mail gesendet, text=Link gesendet, text=Erfolgreich')).toBeVisible({ timeout: 5_000 });

    // Wait for the reset email
    const email = await waitForEmail(user!.mailTmToken!, /passwort|reset/i, 30_000);
    expect(email).toBeTruthy();

    // Extract reset link from email body
    const body = email!.intro || '';
    const linkMatch = body.match(/https?:\/\/[^\s]+resetPassword[^\s]*/);
    expect(linkMatch).toBeTruthy();

    // Navigate to reset link
    await page.goto(linkMatch![0]);
    await page.waitForLoadState('networkidle');

    // Enter new password
    const newPassword = 'NewTest1234!';
    const passwordInputs = page.locator('input[type="password"]');
    const count = await passwordInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Fill all password fields
    for (let i = 0; i < count; i++) {
      await passwordInputs.nth(i).fill(newPassword);
    }

    // Submit
    await page.click('button:has-text("Speichern"), button:has-text("Setzen"), button:has-text("Bestätigen")');

    // Should show success
    await expect(page.locator('text=Erfolgreich, text=gesetzt, text=geändert')).toBeVisible({ timeout: 5_000 });
  });
});
