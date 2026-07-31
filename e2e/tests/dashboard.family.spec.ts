import { test, expect, type Page } from '@playwright/test';
import { getTestUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { createWorkHourViaApi, deleteAllWorkHoursFor } from '../helpers/work-hours-helper';

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const today = toLocalDateInput(new Date());
const currentYear = new Date().getFullYear();

test.describe('Dashboard Family View', () => {
  let activeUserEmail: string | undefined;

  async function startAs(page: Page, index: number) {
    const user = getTestUser(index);
    activeUserEmail = user.email;
    await deleteAllWorkHoursFor(user.email);
    return user;
  }

  test.afterEach(async () => {
    if (activeUserEmail) await deleteAllWorkHoursFor(activeUserEmail);
    activeUserEmail = undefined;
  });

  test('shows family progress and all family members', async ({ page }) => {
    // Family 8 has exactly two members (indices 14 and 15), both eligible (8h each)
    const user = await startAs(page, 14);
    const partner = getTestUser(15);
    expect(partner.familyId).toBe(user.familyId);

    // Seed 2h for the current user before the dashboard loads
    await createWorkHourViaApi(user.email, today, 'E2E Familie', 2.0);
    await loginViaBrowser(page, user.email, getFixtures().password);

    // Family heading and progress section
    await expect(page.locator(`text=Familie - ${currentYear}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Familien-Fortschritt')).toBeVisible();
    await expect(page.locator('text=Familienmitglieder:')).toBeVisible();

    // Both members listed, current user marked "(Sie)"
    await expect(page.locator(`text=${user.lastName}`)).toBeVisible();
    await expect(page.locator(`text=${partner.lastName}`)).toBeVisible();
    await expect(page.locator(`text=${user.lastName} (Sie)`)).toBeVisible();

    // Progress reflects the seeded 2h of 16h required (8h each member)
    await expect(page.locator('text=2 Std von 16 Std')).toBeVisible();
    await expect(page.locator('text=Noch zu erledigen')).toBeVisible();
    await expect(page.locator('text=14 Std')).toBeVisible();
  });

  test('adding an entry via the UI updates family progress', async ({ page }) => {
    // Family 9 (users 16/17) to avoid sharing the read-limit bucket with the
    // other family test (which uses family 8 = users 14/15).
    const user = await startAs(page, 16);
    const partner = getTestUser(17);
    expect(partner.familyId).toBe(user.familyId);
    await loginViaBrowser(page, user.email, getFixtures().password);

    // Empty family: 0 of 16 hours
    await expect(page.locator('text=Familie - ' + currentYear)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=0 Std von 16 Std')).toBeVisible();

    // Add 2.5h via the modal
    await page.locator('button:has-text("Eintragen")').first().click();
    await expect(page.locator('text=Neue Arbeitsstunden eintragen')).toBeVisible({ timeout: 5_000 });
    await page.locator('input[name="Datum"]').fill(today);
    await page.locator('input[name="Stunden"]').fill('2.5');
    await page.locator('input[name="Tätigkeit"]').fill('E2E UI Familie');
    await page.locator('button:has-text("Erstellen")').click();

    await expect(page.locator('text=Eintrag erfolgreich erstellt')).toBeVisible({ timeout: 10_000 });

    // Family progress updates to 2.5 of 16 hours
    await expect(page.locator('text=2.5 Std von 16 Std')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table')).toContainText('E2E UI Familie');
  });
});
