import { test, expect } from '@playwright/test';
import { getOrgaUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { waitForEmail, getMessageById, getAllMessages } from '../helpers/mailpit-checker';

const ORIGINAL_PASSWORD = 'Test1234!';

test.describe('Password Reset', () => {
  test('forgot password sends reset email', async ({ page }) => {
    const fixtures = getFixtures();
    // Use the first orga user
    const user = fixtures.users.find(u => u.role === 'orga');
    expect(user).toBeTruthy();

    // Navigate directly to forgot password page
    await page.goto('/forgotPassword');
    await page.waitForLoadState('networkidle');

    // Fill email
    await page.fill('input[type="email"]', user!.email);

    // Submit
    await page.click('button:has-text("Reset-Link senden")');

    // Should show success toast (backend returns English message)
    await expect(
      page.locator('text=Zurücksetzen Ihres Passworts').or(page.locator('text=Erfolgreich'))
    ).toBeVisible({ timeout: 5_000 });

    // Check Mailpit for the reset email
    const email = await waitForEmail(user!.email, /passwort|reset/i, 30_000);
    expect(email).toBeTruthy();
  });

  test('reset password link works and allows new login', async ({ page }) => {
    const fixtures = getFixtures();
    const user = fixtures.users.find(u => u.role === 'orga');
    expect(user).toBeTruthy();

    // Get existing messages count before requesting reset
    const existingMessages = await getAllMessages();

    // Request password reset
    await page.goto('/forgotPassword');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', user!.email);
    await page.click('button:has-text("Reset-Link senden")');
    await expect(
      page.locator('text=Zurücksetzen Ihres Passworts').or(page.locator('text=Erfolgreich'))
    ).toBeVisible({ timeout: 5_000 });

    // Wait for the new reset email (ignore previous ones)
    const deadline = Date.now() + 30_000;
    let latestEmail: any = null;
    while (Date.now() < deadline) {
      const messages = await getAllMessages();
      const newMessages = messages.filter(
        (m: any) => !existingMessages.some((e: any) => e.id === m.id) &&
          /passwort|reset/i.test(m.subject),
      );
      if (newMessages.length > 0) {
        latestEmail = newMessages[0];
        break;
      }
      await new Promise(r => setTimeout(r, 2_000));
    }
    expect(latestEmail).toBeTruthy();

    // Fetch full message body to extract reset link
    const fullMessage = await getMessageById(latestEmail.id);
    expect(fullMessage).toBeTruthy();
    const body = fullMessage!.text || fullMessage!.html || '';
    const linkMatch = body.match(/https?:\/\/[^\s]+resetPassword[^\s]*/);
    expect(linkMatch).toBeTruthy();

    // Navigate to reset link
    await page.goto(linkMatch![0]);
    await page.waitForLoadState('networkidle');

    // Enter new password
    const newPassword = 'NewTest1234!';
    const newPwInput = page.locator('#newpassword');
    const confirmPwInput = page.locator('#confirmpassword');
    await newPwInput.fill(newPassword);
    await confirmPwInput.fill(newPassword);

    // Submit
    await page.click('button:has-text("Passwort aktualisieren")');

    // Should show success toast (backend returns German message)
    await expect(
      page.locator('text=Passwort erfolgreich zurückgesetzt').or(page.locator('text=Erfolgreich'))
    ).toBeVisible({ timeout: 5_000 });

    // Wait for redirect to login
    await page.waitForURL('**/login**', { timeout: 5_000 });

    // Verify new password works by logging in
    await page.fill('input[type="email"]', user!.email);
    await page.fill('input[type="password"]', newPassword);
    await page.click('button:has-text("Anmelden")');
    await page.waitForURL('**/dashboard**', { timeout: 15_000 });
    await expect(page).toHaveURL(/dashboard/);

    // Restore original password via forgot-password → reset flow
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    await fetch(`${backendUrl}/api/forgotPassword`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user!.email }),
    });
    // Wait for restore email
    const restoreDeadline = Date.now() + 15_000;
    let restoreEmail: any = null;
    while (Date.now() < restoreDeadline) {
      const msgs = await getAllMessages();
      restoreEmail = msgs
        .filter((m: any) => /passwort|reset/i.test(m.subject))
        .sort((a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime())[0];
      if (restoreEmail) break;
      await new Promise(r => setTimeout(r, 1_000));
    }
    if (restoreEmail) {
      const fullRestore = await getMessageById(restoreEmail.id);
      const restoreBody = fullRestore!.text || fullRestore!.html || '';
      const restoreMatch = restoreBody.match(/https?:\/\/[^\s]+resetPassword[^\s]*/);
      if (restoreMatch) {
        const restoreUrl = restoreMatch[0];
        const tokenMatch = restoreUrl.match(/token=([^&]+)/);
        const idMatch = restoreUrl.match(/id=([^&\s]+)/);
        if (tokenMatch && idMatch) {
          await fetch(`${backendUrl}/api/resetPassword`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenMatch[1], password: ORIGINAL_PASSWORD, userId: idMatch[1] }),
          });
        }
      }
    }
  });
});