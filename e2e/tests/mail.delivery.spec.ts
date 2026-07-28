import { test, expect } from '@playwright/test';
import { getOrgaUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { waitForEmail, checkBulkDelivery } from '../helpers/mailtm-checker';

test.describe('Mail Delivery Verification', () => {
  test('bulk mail is delivered to sample recipients', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    const fixtures = getFixtures();

    await loginViaBrowser(page, user!.email, fixtures.password);

    // Open mail composer
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    // Compose mail
    const testSubject = `E2E Delivery Test ${Date.now()}`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', testSubject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', 'Delivery verification test.');

    // Send to all
    await page.click('button:has-text("Alle Mitglieder")');
    await page.click('button:has-text("Versenden")');
    await page.click('button:has-text("Bestätigen")');

    // Wait for sending to complete
    await page.waitForTimeout(10_000);

    // Check delivery across sample users
    const result = await checkBulkDelivery(
      fixtures.users,
      testSubject,
      10,  // sample 10 users
      60_000, // 60s timeout
    );

    // At least 50% of sample should receive
    expect(result.received).toBeGreaterThanOrEqual(Math.ceil(result.total * 0.5));
  });

  test('email content is correct', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();
    expect(user!.mailTmToken).toBeTruthy();

    const fixtures = getFixtures();

    await loginViaBrowser(page, user!.email, fixtures.password);

    // Send a test mail
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    const testSubject = `E2E Content Test ${Date.now()}`;
    const testBody = `Unique body ${Date.now()} for content verification.`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', testSubject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', testBody);

    await page.click('button:has-text("Test-Mail senden")');
    await expect(page.locator('text=Test-Mail gesendet')).toBeVisible({ timeout: 10_000 });

    // Wait for email and verify content
    const email = await waitForEmail(user!.mailTmToken!, testSubject, 30_000);
    expect(email).toBeTruthy();
    expect(email!.intro).toContain(testBody.substring(0, 20));
  });
});