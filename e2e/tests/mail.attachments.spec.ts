import { test, expect } from '@playwright/test';
import { getOrgaUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { waitForEmail, getMessageById } from '../helpers/mailpit-checker';

const MB = 1024 * 1024;

const file = (name: string, size: number) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.alloc(size, 'x'),
});

test.describe('Mail Attachments', () => {
  test('test mail delivers the attached file', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    const fileName = 'e2e-attachment.txt';
    await page.locator('input[type="file"]').setInputFiles(file(fileName, 32));
    await expect(page.getByText(fileName)).toBeVisible();

    const subject = `E2E Attachment ${Date.now()}`;
    await page.fill('#mail-subject, input[placeholder*="Betreff"]', subject);
    await page.fill('#mail-message, textarea[placeholder*="Nachricht"]', 'Attachment test.');
    await page.click('button:has-text("Test-Mail senden")');
    await expect(page.locator('text=Test-Mail gesendet')).toBeVisible({ timeout: 10_000 });

    const email = await waitForEmail(user!.email, subject, 30_000);
    expect(email).toBeTruthy();

    const full = await getMessageById(email!.id);
    expect(full).toBeTruthy();
    const attachment = full!.attachments.find((a) => a.fileName === fileName);
    expect(attachment, 'delivered message should carry the attachment').toBeTruthy();
    expect(attachment!.size).toBeGreaterThan(0);
  });

  test('rejects files over the size, total and count limits', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await page.locator('button:has-text("Rundmail"), a:has-text("Rundmail")').click();
    await expect(page.locator('text=Rundmail versenden')).toBeVisible({ timeout: 5_000 });

    const input = page.locator('input[type="file"]');
    const chips = page.getByRole('button', { name: /entfernen$/ });

    // Single file over 5 MB is rejected.
    await input.setInputFiles(file('big.txt', 5 * MB + 1));
    await expect(page.getByText(/ist zu groß \(max\. 5 MB\)/)).toBeVisible();
    await expect(chips).toHaveCount(0);

    // 5 MB is allowed and shown as a chip.
    await input.setInputFiles(file('five.txt', 5 * MB));
    await expect(page.getByText('five.txt')).toBeVisible();
    await expect(chips).toHaveCount(1);

    // Four more 4 MB files push the total over 20 MB, so they are rejected.
    await input.setInputFiles([
      file('a.txt', 4 * MB),
      file('b.txt', 4 * MB),
      file('c.txt', 4 * MB),
      file('d.txt', 4 * MB),
    ]);
    await expect(page.getByText(/zusammen höchstens 20 MB/)).toBeVisible();
    await expect(chips).toHaveCount(1);

    // Removing the 5 MB chip makes room for five small files, but not six.
    await page.getByRole('button', { name: 'Datei five.txt entfernen' }).click();
    await expect(chips).toHaveCount(0);

    await input.setInputFiles([
      file('1.txt', 16),
      file('2.txt', 16),
      file('3.txt', 16),
      file('4.txt', 16),
      file('5.txt', 16),
    ]);
    await expect(chips).toHaveCount(5);

    await input.setInputFiles(file('6.txt', 16));
    await expect(page.getByText('Maximal 5 Anhänge.')).toBeVisible();
    await expect(chips).toHaveCount(5);
  });
});
