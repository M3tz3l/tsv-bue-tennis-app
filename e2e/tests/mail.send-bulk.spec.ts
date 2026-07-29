import { test, expect } from '@playwright/test';
import { getOrgaUser, getRegularUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { waitForEmail, checkBulkDelivery } from '../helpers/mailpit-checker';

test.describe('Send Bulk Mail', () => {
  test('orga user can open mail composer', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Find and click the Rundmail button
    const mailButton = page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")');
    await expect(mailButton).toBeVisible({ timeout: 5_000 });
    await mailButton.click();

    // Mail composer dialog should open
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });
  });

  test('regular user cannot see mail composer button', async ({ page }) => {
    const user = getRegularUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Rundmail button should NOT be visible
    const mailButton = page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")');
    await expect(mailButton).not.toBeVisible();
  });

  test('send test mail to self', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // Fill subject and message
    const testSubject = `E2E Test Mail ${Date.now()}`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', testSubject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', 'Dies ist ein E2E Test.');

    // Click test mail button
    await page.click('button:has-text("Test-Mail senden")');

    // Should show success toast
    await expect(page.locator('text=Test-Mail gesendet')).toBeVisible({ timeout: 10_000 });

    // Verify email was received via Mailpit
    const received = await waitForEmail(user!.email, testSubject, 30_000);
    expect(received).toBeTruthy();
  });

  test('send bulk mail to all members', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // Fill subject and message
    const testSubject = `E2E Bulk Mail ${Date.now()}`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', testSubject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', 'Dies ist ein E2E Bulk Test.');

    // Select "Alle Mitglieder" (should be default)
    await page.click('button:has-text("Alle Mitglieder")');

    // Click send
    await page.click('button:has-text("Versenden")');

    // Confirm in popover
    await page.click('button:has-text("Bestätigen")');

    // Should show sending progress or toast
    await expect(
      page.locator('text=Sende Mails').or(page.locator('text=Wird gestartet')).or(page.locator('text=gestartet'))
    ).toBeVisible({ timeout: 10_000 });

    // Wait for sending to start
    await page.waitForTimeout(5_000);

    // Use checkBulkDelivery for concurrent polling
    const fixtures = getFixtures();
    const recipientEmails = fixtures.users.map(u => u.email);
    const result = await checkBulkDelivery(recipientEmails, testSubject, 5, 30_000);

    // At least 3 out of 5 should have received the email
    expect(result.received).toBeGreaterThanOrEqual(3);
  });
});