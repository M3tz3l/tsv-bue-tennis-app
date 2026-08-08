import { test, expect, type Page } from '@playwright/test';
import { getFixtures, getTestUser, getOrgaUser, loginViaBrowser } from '../helpers/auth-helper';
import { createEventViaApi, deleteAllE2EEvents, type CreatedEvent } from '../helpers/events-helper';

const LOAD_ERROR_TEXT = 'Veranstaltungen konnten nicht geladen werden';

/**
 * Opens the events page and waits for the list to load. The events read
 * endpoint is rate-limited per user; under CI's serial test load it can
 * transiently return 429, which the page surfaces as "could not be loaded".
 * Retry the navigation a few times to ride out such a burst before failing.
 */
async function gotoEventsAndWaitForLoad(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto('/dashboard/veranstaltungen');
    // A successful load renders at least one event card or the empty state.
    const loaded = page.getByText('Keine anstehenden Veranstaltungen');
    const error = page.getByText(LOAD_ERROR_TEXT);
    await expect
      .poll(async () => (await error.isVisible().catch(() => false)) || (await loaded.isVisible().catch(() => false)) || (await page.locator('article').count()) > 0, {
        timeout: 10_000,
        intervals: [250, 500, 1000],
      })
      .toBe(true);
    if (!(await error.isVisible().catch(() => false))) {
      return;
    }
    await page.waitForTimeout(2_000);
  }
}

test.describe('Event draft badge', () => {
  test.afterEach(async () => {
    await deleteAllE2EEvents();
  });

  test('shows an Entwurf badge on draft events for Orga', async ({ page }) => {
    const orga = getOrgaUser()!;
    const created = await createEventViaApi({ title: 'E2E Event Draft' });

    await loginViaBrowser(page, orga.email, getFixtures().password);
    await gotoEventsAndWaitForLoad(page);

    // The draft event is visible to the orga and carries the badge.
    const card = page.locator('article').filter({ hasText: created.title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Entwurf', { exact: true })).toBeVisible();
  });

  test('does not show draft events (or the badge) to regular members', async ({ page }) => {
    const member = getTestUser(10); // a regular (non-orga) member
    const created = await createEventViaApi({ title: 'E2E Event Draft' });

    await loginViaBrowser(page, member.email, getFixtures().password);
    await gotoEventsAndWaitForLoad(page);

    await expect(page.getByText(created.title)).not.toBeVisible();
    await expect(page.getByText('Entwurf', { exact: true })).toHaveCount(0);
  });
});
