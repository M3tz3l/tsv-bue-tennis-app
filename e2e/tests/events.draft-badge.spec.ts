import { test, expect, type Page } from '@playwright/test';
import { getFixtures, getTestUser, getOrgaUser, loginViaBrowser } from '../helpers/auth-helper';
import { createEventViaApi, deleteAllE2EEvents, type CreatedEvent } from '../helpers/events-helper';

test.describe('Event draft badge', () => {
  test.afterEach(async () => {
    await deleteAllE2EEvents();
  });

  test('shows an Entwurf badge on draft events for Orga', async ({ page }) => {
    const orga = getOrgaUser()!;
    const created = await createEventViaApi({ title: 'E2E Draft Event' });

    await loginViaBrowser(page, orga.email, getFixtures().password);
    await page.goto('/dashboard/veranstaltungen');

    // The draft event is visible to the orga and carries the badge.
    const card = page.locator('article').filter({ hasText: created.title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Entwurf', { exact: true })).toBeVisible();
  });

  test('does not show draft events (or the badge) to regular members', async ({ page }) => {
    const member = getTestUser(10); // a regular (non-orga) member
    const created = await createEventViaApi({ title: 'E2E Draft Event' });

    await loginViaBrowser(page, member.email, getFixtures().password);
    await page.goto('/dashboard/veranstaltungen');

    await expect(page.getByText(created.title)).not.toBeVisible();
    await expect(page.getByText('Entwurf', { exact: true })).toHaveCount(0);
  });
});
