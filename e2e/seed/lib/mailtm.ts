import { config } from './config.js';

export interface MailTmAccount {
  id: string;
  address: string;
  password: string;
  token: string;
}

interface MailTmDomain {
  id: string;
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

interface MailTmAccountResponse {
  id: string;
  address: string;
  quota: number;
  used: number;
  isDisabled: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

let cachedDomain: string | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function getAvailableDomain(): Promise<string> {
  if (cachedDomain) return cachedDomain;

  const res = await fetch(`${config.mailtmApiUrl}/domains`);
  if (!res.ok) throw new Error(`Failed to fetch mail.tm domains: ${res.status}`);

  const data = await res.json() as { 'hydra:member': MailTmDomain[] };
  const active = data['hydra:member'].find(d => d.isActive && !d.isPrivate);
  if (!active) throw new Error('No active mail.tm domain available');

  cachedDomain = active.domain;
  return cachedDomain;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const delayMs = retryAfter
        ? Math.max(parseInt(retryAfter, 10) * 1000, 2000)
        : 2000 * (attempt + 1);

      console.log(`    429, waiting ${delayMs}ms...`);
      await sleep(delayMs);
      continue;
    }

    return res;
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}

/**
 * Try to get a token for an existing account.
 * Returns the token if successful, null if account doesn't exist or wrong password.
 */
async function tryGetToken(address: string, password: string): Promise<string | null> {
  const res = await fetchWithRetry(`${config.mailtmApiUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });

  if (res.ok) {
    const data = await res.json() as { token: string };
    return data.token;
  }

  // 401 = wrong password, 404 = not found
  return null;
}

/**
 * Create a new account and get its token.
 */
async function createAndToken(address: string, password: string): Promise<MailTmAccount | null> {
  const createRes = await fetchWithRetry(`${config.mailtmApiUrl}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });

  // 409/422 = already exists (race condition), try token instead
  if (createRes.status === 409 || createRes.status === 422) {
    const token = await tryGetToken(address, password);
    if (token) {
      return { id: address, address, password, token };
    }
    return null; // Exists but wrong password
  }

  if (!createRes.ok) {
    return null;
  }

  // Get token for newly created account
  await sleep(200);
  const token = await tryGetToken(address, password);
  if (!token) return null;

  const accountData = await createRes.json() as MailTmAccountResponse;
  return { id: accountData.id, address, password, token };
}

export async function getMessages(token: string): Promise<any[]> {
  const res = await fetch(`${config.mailtmApiUrl}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch mail.tm messages: ${res.status}`);

  const data = await res.json() as { 'hydra:member': any[] };
  return data['hydra:member'] || [];
}

export async function getMessage(token: string, messageId: string): Promise<any> {
  const res = await fetch(`${config.mailtmApiUrl}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch mail.tm message: ${res.status}`);
  return res.json();
}

export async function deleteAccount(id: string, token: string): Promise<void> {
  await fetch(`${config.mailtmApiUrl}/accounts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Create accounts, trying token first to minimize API calls.
 * - Existing account with correct password: 1 request (token)
 * - New account: 2 requests (create + token)
 * - Existing with wrong password: 2 requests (token fail + create fail)
 *
 * 8 QPS limit, 250ms between requests = 4 QPS safe.
 */
export async function createAccountsBatch(
  accounts: Array<{ address: string; password: string }>,
): Promise<MailTmAccount[]> {
  const results: MailTmAccount[] = [];
  let tokenOnlyCount = 0;
  let createdCount = 0;
  let failedCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];

    if (i % 20 === 0 || i === accounts.length - 1) {
      console.log(`  [${i + 1}/${accounts.length}] token_ok=${tokenOnlyCount} created=${createdCount} failed=${failedCount}`);
    }

    try {
      // Step 1: Try to get token for existing account (1 request)
      const token = await tryGetToken(account.address, account.password);

      if (token) {
        results.push({
          id: account.address,
          address: account.address,
          password: account.password,
          token,
        });
        tokenOnlyCount++;
      } else {
        // Step 2: Account doesn't exist or wrong password — try to create (2+ requests)
        const created = await createAndToken(account.address, account.password);
        if (created) {
          results.push(created);
          createdCount++;
        } else {
          failedCount++;
        }
      }
    } catch (err: any) {
      console.error(`  ${account.address}: ${err.message}`);
      failedCount++;
      await sleep(2000); // Extra wait after failure
    }

    // 250ms between requests = 4 QPS (well under 8 QPS limit)
    if (i < accounts.length - 1) {
      await sleep(250);
    }
  }

  console.log(`  Final: ${results.length} with tokens (${tokenOnlyCount} reused, ${createdCount} created), ${failedCount} skipped`);
  return results;
}
