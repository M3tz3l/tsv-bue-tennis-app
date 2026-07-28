import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { TestFixtures } from '../seed/lib/fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedFixtures: TestFixtures | null = null;

export function getFixtures(): TestFixtures {
  if (cachedFixtures) return cachedFixtures;

  const fixturePath = join(__dirname, '..', 'seed', 'fixtures', 'test-users.json');
  cachedFixtures = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  return cachedFixtures;
}

export function getTestUser(index: number) {
  return getFixtures().users[index];
}

export function getOrgaUser() {
  return getFixtures().users.find(u => u.role === 'orga');
}

/** Like getOrgaUser but only returns one that has a mail.tm token. */
export function getOrgaUserWithToken() {
  return getFixtures().users.find(u => u.role === 'orga' && u.mailTmToken);
}

export function getRegularUser() {
  return getFixtures().users.find(u => u.role !== 'orga');
}

export async function loginViaApi(
  email: string,
  password: string,
  backendUrl = process.env.BACKEND_URL || 'http://localhost:5000',
): Promise<{ token: string; user: any }> {
  const res = await fetch(`${backendUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${err}`);
  }

  const data = await res.json();
  return { token: data.token, user: data.user };
}

export async function loginViaBrowser(
  page: any,
  email: string,
  password: string,
) {
  await page.goto('/');
  await page.fill('input[type="email"], input[placeholder*="E-Mail"]', email);
  await page.fill('input[type="password"], input[placeholder*="Passwort"]', password);
  await page.click('button:has-text("Anmelden")');
  await page.waitForURL('**/dashboard**', { timeout: 10_000 });
}
