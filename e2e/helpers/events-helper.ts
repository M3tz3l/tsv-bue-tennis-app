import { getFixtures } from './auth-helper';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RATE_LIMIT_RETRIES = 4;

/** Fetch that retries on 429 (RATE_LIMIT_EXCEEDED) with backoff. */
async function fetchWithRateLimitRetry(url: string, init: RequestInit): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    response = await fetch(url, init);
    if (response.status !== 429) return response;
  }
  throw new Error(`Rate limit exceeded (429) after ${RATE_LIMIT_RETRIES} attempts for ${url}`);
}

async function getOrgaToken(): Promise<string> {
  const orga = getFixtures().users.find((u) => u.role === 'orga');
  if (!orga) throw new Error('No orga user in fixtures');
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: orga.email, password: getFixtures().password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${orga.email}: ${res.status}`);
  const data = await res.json();
  const token = data?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Orga login returned no token');
  }
  return token;
}

export interface CreatedEvent {
  id: number;
  title: string;
}

export async function createEventViaApi(overrides: Record<string, unknown> = {}): Promise<CreatedEvent> {
  const token = await getOrgaToken();
  const payload = {
    type: 'event',
    title: `E2E Event ${Date.now()}`,
    description: null,
    event_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    start_time: null,
    end_time: null,
    location: 'Clubheim',
    signup_deadline: null,
    capacity: null,
    allow_salad: false,
    allow_cake: false,
    allow_signups: true,
    status: 'draft',
    ...overrides,
  };

  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`createEventViaApi failed: ${res.status} ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`createEventViaApi failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const id = body?.id;
  if (typeof id !== 'number') {
    throw new Error(`createEventViaApi returned no id: ${JSON.stringify(body)}`);
  }
  return { id, title: payload.title };
}

export async function deleteEventViaApi(id: number): Promise<void> {
  const token = await getOrgaToken();
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`deleteEventViaApi failed for ${id}: ${res.status}`);
}

/** Delete every event created by E2E tests so runs start from a clean slate. */
export async function deleteAllE2EEvents(): Promise<void> {
  const token = await getOrgaToken();
  const res = await fetchWithRateLimitRetry(`${BACKEND_URL}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`deleteAllE2EEvents: list failed: ${res.status}`);
  const details = await res.json();
  const events: Array<{ event: { id: number; title: string } }> = Array.isArray(details) ? details : [];
  for (const { event } of events) {
    if (event.title.startsWith('E2E Event ')) {
      await deleteEventViaApi(event.id);
    }
  }
}
