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

    // Click send — shows inline confirmation
    await page.click('button:has-text("Versenden"):not(:has-text("Jetzt"))');

    // Confirm inline — click "Jetzt senden"
    await page.click('button:has-text("Jetzt senden")');

    // Should show progress view
    await expect(
      page.locator('text=Mails werden versendet').or(page.locator('text=Mail versenden'))
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

  test('job status is pollable after bulk send', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // Fill subject and message
    const testSubject = `E2E Job Status Test ${Date.now()}`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', testSubject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', 'Job status polling test.');

    // Intercept the POST response to capture the job_id
    let capturedJobId = '';
    await page.route('**/api/mail/send', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      capturedJobId = body.job_id || '';
      await route.fulfill({ response });
    });

    // Also intercept job status GET requests to verify they succeed
    let jobStatusRequests: { url: string; status: number }[] = [];
    await page.route('**/api/mail/jobs/**', async (route) => {
      const response = await route.fetch();
      jobStatusRequests.push({ url: route.request().url(), status: response.status() });
      await route.fulfill({ response });
    });

    // Send
    await page.click('button:has-text("Versenden"):not(:has-text("Jetzt"))');
    await page.click('button:has-text("Jetzt senden")');

    // Wait for at least one job status poll to complete
    await expect.poll(() => jobStatusRequests.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);

    // Verify the job_id was captured
    expect(capturedJobId).toBeTruthy();

    // Verify all job status requests returned 200 (not 404)
    for (const req of jobStatusRequests) {
      expect(req.status, `Job status request to ${req.url} should return 200`).toBe(200);
    }

    // Verify progress view shows sent count > 0 eventually
    await expect(
      page.locator('text=/\\d+ gesendet/').or(page.locator('text=Fertig'))
    ).toBeVisible({ timeout: 30_000 });
  });
});