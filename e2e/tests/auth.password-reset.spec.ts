import { test, expect } from '@playwright/test';
import { getFixtures } from '../helpers/auth-helper';
import { waitForEmail, getMessages } from '../helpers/mailtm-checker';

const MAILTM_API = 'https://api.mail.tm';

// Pick an orga user that has a mail.tm token (prefer the last one for isolation from other tests)
function getIsolatedOrgaUser() {
  const fixtures = getFixtures();
  const orgaUsers = fixtures.users.filter(u => u.role === 'orga' && u.mailTmToken);
  return orgaUsers[orgaUsers.length - 1] || null;
}

const ORIGINAL_PASSWORD = 'Test1234!';

async function getFullMessage(token: string, messageId: string) {
  const res = await fetch(`${MAILTM_API}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch message: ${res.status}`);
  return res.json() as Promise<{ text: string; html: string[] }>;
}

test.describe('Password Reset', () => {
  test('forgot password sends reset email', async ({ page }) => {
    const user = getIsolatedOrgaUser();
    expect(user).toBeTruthy();
    expect(user!.mailTmToken).toBeTruthy();

    // Navigate directly to forgot password page
    await page.goto('/forgotPassword');
    await page.waitForLoadState('networkidle');

    // Fill email
    await page.fill('input[type="email"]', user!.email);

    // Submit
    await page.click('button:has-text("Reset-Link senden")');

    // Should show success toast (backend returns English message)
    await expect(
      page.locator('text=reset link has been sent').or(page.locator('text=Erfolgreich'))
    ).toBeVisible({ timeout: 5_000 });

    // Check mail.tm for the reset email
    const email = await waitForEmail(user!.mailTmToken!, /passwort|reset/i, 30_000);
    expect(email).toBeTruthy();
  });

  test('reset password link works and allows new login', async ({ page }) => {
    const user = getIsolatedOrgaUser();
    expect(user).toBeTruthy();
    expect(user!.mailTmToken).toBeTruthy();

    // Count existing emails before requesting reset
    const existingMessages = await getMessages(user!.mailTmToken!);

    // Request password reset
    await page.goto('/forgotPassword');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', user!.email);
    await page.click('button:has-text("Reset-Link senden")');
    await expect(
      page.locator('text=reset link has been sent').or(page.locator('text=Erfolgreich'))
    ).toBeVisible({ timeout: 5_000 });

    // Wait for the new reset email (ignore previous ones)
    const deadline = Date.now() + 30_000;
    let latestEmail: any = null;
    while (Date.now() < deadline) {
      const messages = await getMessages(user!.mailTmToken!);
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
    const fullMessage = await getFullMessage(user!.mailTmToken!, latestEmail.id);
    const body = fullMessage.text || fullMessage.html?.join('\n') || '';
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

    // Restore original password via API for fixture consistency
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    await fetch(`${backendUrl}/api/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword: ORIGINAL_PASSWORD }),
    });
  });
});
