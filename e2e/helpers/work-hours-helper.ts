import { getFixtures, loginViaApi } from './auth-helper.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

export interface WorkHourApiData {
  id: string;
}

export async function getWorkHoursToken(email: string): Promise<string> {
  const { token } = await loginViaApi(email, getFixtures().password);
  return token;
}

export async function createWorkHourViaApi(
  email: string,
  date: string,
  description: string,
  hours: number,
): Promise<string> {
  const token = await getWorkHoursToken(email);
  const res = await fetch(`${BACKEND_URL}/api/arbeitsstunden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ Datum: date, Tätigkeit: description, Stunden: hours }),
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    throw new Error(`createWorkHourViaApi failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.data?.id as string;
}

export async function deleteWorkHourViaApi(id: string, email: string): Promise<void> {
  const token = await getWorkHoursToken(email);
  await fetch(`${BACKEND_URL}/api/arbeitsstunden/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Delete all work hour entries owned by the given user (personal + family
 * contributions) so tests start from a clean slate.
 */
export async function deleteAllWorkHoursFor(email: string): Promise<void> {
  const token = await getWorkHoursToken(email);
  const currentYear = new Date().getFullYear();

  // Cover both the current year and the previous year (one-month grace period).
  const seen = new Set<string>();
  for (const year of [currentYear, currentYear - 1]) {
    const res = await fetch(`${BACKEND_URL}/api/dashboard/${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;

    const data = await res.json();
    const personal = data?.personal?.entries || [];
    const family = (data?.family?.memberContributions || []).flatMap(
      (m: { entries?: Array<{ id: string }> }) => m.entries || [],
    );

    for (const entry of [...personal, ...family]) {
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      await deleteWorkHourViaApi(entry.id, email);
    }
  }
}
