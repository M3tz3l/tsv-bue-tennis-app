import { test, expect } from '@playwright/test';
import { getOrgaUser, getTestUser, getFixtures, loginViaBrowser } from '../helpers/auth-helper';
import { createWorkHourViaApi, deleteAllWorkHoursFor } from '../helpers/work-hours-helper';

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const today = toLocalDateInput(new Date());
const currentYear = new Date().getFullYear();
const previousYear = currentYear - 1;

test.describe('Dashboard Navigation', () => {
  test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible();
  });

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible();
  });

  test('logout clears the token and returns to /login', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await expect(page).toHaveURL(/dashboard/);

    const tokenBefore = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenBefore).toBeTruthy();

    await page.locator('button:has-text("Abmelden")').click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    const tokenAfter = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenAfter).toBeNull();
  });

  test('dashboard is not accessible after logout', async ({ page }) => {
    const user = getOrgaUser();
    expect(user).toBeTruthy();

    await loginViaBrowser(page, user!.email, getFixtures().password);
    await expect(page).toHaveURL(/dashboard/);

    await page.locator('button:has-text("Abmelden")').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible();
  });

  test('year selector shows entries only for the selected year', async ({ page }) => {
    const user = getTestUser(12); // regular user, unused by other specs
    expect(user).toBeTruthy();

    await deleteAllWorkHoursFor(user!.email);
    const description = `E2E Jahr ${Date.now()}`;
    try {
      await createWorkHourViaApi(user!.email, today, description, 2.0);

      // Dashboard loads after seeding so the current-year entry is visible
      await loginViaBrowser(page, user!.email, getFixtures().password);
      await expect(page.locator('table').getByText(description)).toBeVisible({ timeout: 10_000 });

      const yearSelect = page.locator('select');
      await expect(yearSelect).toBeVisible({ timeout: 10_000 });

      // Previous year has no entries
      await yearSelect.selectOption(String(previousYear));
      await expect(
        page.locator(`text=Keine Arbeitsstunden für ${previousYear} gefunden`),
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('table').getByText(description)).not.toBeVisible();

      // Switch back to the current year: the entry reappears
      await yearSelect.selectOption(String(currentYear));
      await expect(page.locator('table').getByText(description)).toBeVisible({ timeout: 10_000 });
    } finally {
      // Clean up the seeded entry even if an assertion fails
      await deleteAllWorkHoursFor(user!.email);
    }
  });
});
