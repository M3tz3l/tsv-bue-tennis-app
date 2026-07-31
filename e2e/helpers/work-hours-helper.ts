import { getFixtures } from './auth-helper.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RATE_LIMIT_RETRIES = 4;

/**
 * Fetch that retries on 429 (RATE_LIMIT_EXCEEDED) with backoff. The backend
 * rate-limits authenticated API requests per user, so bursts from setup +
 * cleanup can temporarily exceed it. Only 429 is retried; real errors surface
 * to the caller as failures.
 */
async function fetchWithRateLimitRetry(url: string, init: RequestInit): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt); // 2s, 4s, 6s
    response = await fetch(url, init);
    if (response.status !== 429) return response;
  }
  throw new Error(`Rate limit exceeded (429) after ${RATE_LIMIT_RETRIES} attempts for ${url}`);
}

export interface WorkHourApiData {
  id: string;
}

export async function getWorkHoursToken(email: string): Promise<string> {
  const password = getFixtures().password;
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

export async function createWorkHourViaApi(
  email: string,
  date: string,
  description: string,
  hours: number,
): Promise<string> {
  const token = await getWorkHoursToken(email);
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/arbeitsstunden`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ Datum: date, Tätigkeit: description, Stunden: hours }),
  });
  const raw = await res.text();
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`createWorkHourViaApi failed: ${res.status} ${raw.slice(0, 200)}`);
  }
  if (!res.ok || body.success === false) {
    throw new Error(`createWorkHourViaApi failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const id = body.data?.id;
  if (typeof id !== 'string') {
    throw new Error(`createWorkHourViaApi returned no id: ${JSON.stringify(body)}`);
  }
  return id;
}

export async function deleteWorkHourViaApi(
  id: string,
  email: string,
  token?: string,
): Promise<void> {
  const authToken = token ?? (await getWorkHoursToken(email));
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/arbeitsstunden/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.status === 404) return; // already deleted
  if (!res.ok) {
    throw new Error(`deleteWorkHourViaApi failed for ${id}: ${res.status}`);
  }
}

/**
 * Delete all work hour entries owned by the given user (personal + family
 * contributions) so tests start from a clean slate.
 */
export async function deleteAllWorkHoursFor(email: string): Promise<void> {
  const token = await getWorkHoursToken(email);
  const now = new Date();
  const currentYear = now.getFullYear();
  // Previous-year entries are only possible during January (one-month grace
  // period), so only query the previous year then.
  const years = now.getMonth() === 0 ? [currentYear - 1, currentYear] : [currentYear];

  const seen = new Set<string>();
  for (const year of years) {
    const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/dashboard/${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `deleteAllWorkHoursFor: dashboard fetch failed for ${year}: ${res.status}`,
      );
    }

    const data = await res.json();
    const personal = data?.personal?.entries || [];
    const family = (data?.family?.memberContributions || []).flatMap(
      (m: { entries?: Array<{ id: string }> }) => m.entries || [],
    );

    for (const entry of [...personal, ...family]) {
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      await deleteWorkHourViaApi(entry.id, email, token);
    }
  }
}
