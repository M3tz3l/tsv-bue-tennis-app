import { test, expect, type Page } from '@playwright/test';
import { getFixtures, getTestUser, loginViaBrowser } from '../helpers/auth-helper';
import { createWorkHourViaApi, deleteAllWorkHoursFor } from '../helpers/work-hours-helper';

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const today = toLocalDateInput(new Date());
const tomorrow = toLocalDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000));

async function openAddModal(page: Page) {
  // Empty state: "Arbeitsstunden eintragen"; table header: "Eintragen"
  const addButton = page.locator('button:has-text("Eintragen")').first();
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.click();
  await expect(page.locator('text=Neue Arbeitsstunden eintragen')).toBeVisible({ timeout: 5_000 });
}

test.describe('Work Hours', () => {
  let activeUserEmail: string | undefined;

  async function startAs(page: Page, index: number) {
    const user = getTestUser(index);
    activeUserEmail = user.email;
    await deleteAllWorkHoursFor(user.email);
    return user;
  }

  async function loginAs(page: Page, email: string) {
    await loginViaBrowser(page, email, getFixtures().password);
  }

  test.afterEach(async () => {
    if (activeUserEmail) await deleteAllWorkHoursFor(activeUserEmail);
    activeUserEmail = undefined;
  });

  test('shows empty state with first-entry CTA when no entries exist', async ({ page }) => {
    const user = await startAs(page, 10); // regular user
    await loginAs(page, user.email);

    await expect(page.locator('text=Keine Arbeitsstunden')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button:has-text("Arbeitsstunden eintragen")')).toBeVisible();
  });

  test('creates a work hour entry', async ({ page }) => {
    const user = await startAs(page, 5); // regular user
    await loginAs(page, user.email);
    const description = `E2E Eintrag ${Date.now()}`;

    await openAddModal(page);

    // Name fields are prefilled from the profile and read-only
    await expect(page.locator('input[name="Nachname"]')).not.toHaveValue('');
    await expect(page.locator('input[name="Vorname"]')).not.toHaveValue('');

    await page.locator('input[name="Datum"]').fill(today);
    await page.locator('input[name="Stunden"]').fill('2.5');
    await page.locator('input[name="Tätigkeit"]').fill(description);
    await page.locator('button:has-text("Erstellen")').click();

    await expect(page.locator('text=Eintrag erfolgreich erstellt')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('table tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(description);
    await expect(row).toContainText('2.5');
  });

  test('edits an existing work hour entry', async ({ page }) => {
    const user = await startAs(page, 6); // regular user
    const originalDescription = `E2E Original ${Date.now()}`;
    const updatedDescription = `E2E Aktualisiert ${Date.now()}`;
    await createWorkHourViaApi(user.email, today, originalDescription, 2.0);
    await loginAs(page, user.email);

    await expect(page.locator('table').getByText(originalDescription)).toBeVisible({ timeout: 10_000 });

    // Open the edit modal (desktop table; the mobile block renders a hidden duplicate)
    await page.locator('table button[aria-label="Bearbeiten"]').click();
    await expect(page.locator('text=Arbeitsstunden bearbeiten')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('input[name="Tätigkeit"]')).toHaveValue(originalDescription);
    await expect(page.locator('input[name="Stunden"]')).toHaveValue('2');

    await page.locator('input[name="Stunden"]').fill('3.75');
    await page.locator('input[name="Tätigkeit"]').fill(updatedDescription);
    await page.locator('button:has-text("Aktualisieren")').click();

    await expect(page.locator('text=Eintrag erfolgreich aktualisiert')).toBeVisible({ timeout: 10_000 });

    const row = page.locator('table tbody tr');
    await expect(row).toContainText(updatedDescription);
    await expect(row).toContainText('3.75');
    await expect(page.locator('table').getByText(originalDescription)).toHaveCount(0);
  });

  test('deletes a work hour entry after confirmation', async ({ page }) => {
    const user = await startAs(page, 7); // regular user
    const description = `E2E Löschen ${Date.now()}`;
    await createWorkHourViaApi(user.email, today, description, 1.5);
    await loginAs(page, user.email);

    await expect(page.locator('table').getByText(description)).toBeVisible({ timeout: 10_000 });

    // Open the edit modal and trigger the delete confirmation
    await page.locator('table button[aria-label="Bearbeiten"]').click();
    await expect(page.locator('text=Arbeitsstunden bearbeiten')).toBeVisible({ timeout: 5_000 });
    await page.locator('button:has-text("Löschen")').click();

    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Eintrag löschen' });
    await expect(page.locator('text=Eintrag löschen')).toBeVisible({ timeout: 5_000 });
    await confirmDialog.locator('button:has-text("Löschen")').click();

    await expect(page.locator('text=Eintrag erfolgreich gelöscht')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Keine Arbeitsstunden')).toBeVisible({ timeout: 10_000 });
  });

  test('cancelling delete keeps the entry', async ({ page }) => {
    const user = await startAs(page, 8); // regular user
    const description = `E2E Behalten ${Date.now()}`;
    await createWorkHourViaApi(user.email, today, description, 1.0);
    await loginAs(page, user.email);

    await expect(page.locator('table').getByText(description)).toBeVisible({ timeout: 10_000 });

    await page.locator('table button[aria-label="Bearbeiten"]').click();
    await expect(page.locator('text=Arbeitsstunden bearbeiten')).toBeVisible({ timeout: 5_000 });
    await page.locator('button:has-text("Löschen")').click();

    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Eintrag löschen' });
    await expect(page.locator('text=Eintrag löschen')).toBeVisible({ timeout: 5_000 });
    await confirmDialog.locator('button:has-text("Abbrechen")').click();
    await expect(page.locator('text=Eintrag löschen')).toHaveCount(0);

    // Close the edit modal, then verify the entry is still there
    const editDialog = page.getByRole('dialog').filter({ hasText: 'Arbeitsstunden bearbeiten' });
    await editDialog.locator('button:has-text("Abbrechen")').click();
    await expect(page.locator('table').getByText(description)).toBeVisible({ timeout: 10_000 });
  });

  test('rejects a second entry on the same date', async ({ page }) => {
    const user = await startAs(page, 9); // regular user
    const description = `E2E Duplikat ${Date.now()}`;
    await createWorkHourViaApi(user.email, today, 'E2E Setup Duplikat', 1.0);
    await loginAs(page, user.email);

    await expect(page.locator('table').getByText('E2E Setup Duplikat')).toBeVisible({ timeout: 10_000 });

    await openAddModal(page);
    await page.locator('input[name="Datum"]').fill(today);
    await page.locator('input[name="Stunden"]').fill('2');
    await page.locator('input[name="Tätigkeit"]').fill(description);
    await page.locator('button:has-text("Erstellen")').click();

    await expect(
      page.locator('text=Für dieses Datum existiert bereits ein Eintrag'),
    ).toBeVisible({ timeout: 10_000 });

    // The modal closes after the failed attempt, and no duplicate row is created
    await expect(page.locator('text=Neue Arbeitsstunden eintragen')).not.toBeVisible();
    const row = page.locator('table tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('E2E Setup Duplikat');
    await expect(row).not.toContainText(description);
  });

  test('blocks invalid submissions without creating an entry', async ({ page }) => {
    const user = await startAs(page, 11); // regular user
    await loginAs(page, user.email);
    await openAddModal(page);

    // Count create requests; invalid inputs must never reach the API
    let createRequests = 0;
    await page.route('**/api/arbeitsstunden*', async (route) => {
      if (route.request().method() === 'POST') createRequests++;
      await route.continue();
    });

    const cases = [
      { field: 'Datum', value: tomorrow, label: 'future date' },
      { field: 'Stunden', value: '25', label: 'hours above 24' },
      { field: 'Stunden', value: '0', label: 'zero hours' },
      { field: 'Stunden', value: '2.3', label: 'non-quarter-hour hours' },
      { field: 'Tätigkeit', value: '', label: 'empty description' },
    ] as const;

    for (const c of cases) {
      await test.step(`invalid: ${c.label}`, async () => {
        // Reset to valid values, then apply the invalid one
        await page.locator('input[name="Datum"]').fill(today);
        await page.locator('input[name="Stunden"]').fill('2.5');
        await page.locator('input[name="Tätigkeit"]').fill('E2E Valid');
        await page.locator(`input[name="${c.field}"]`).fill(c.value);

        await page.locator('button:has-text("Erstellen")').click();

        // Modal must remain open and no request may be sent
        await expect(page.locator('text=Neue Arbeitsstunden eintragen')).toBeVisible({ timeout: 3_000 });
        await expect
          .poll(() => createRequests, { timeout: 1_000, intervals: [100, 200, 300] })
          .toBe(0);
      });
    }
  });
});
