import type { TestFixtures } from '../seed/lib/fixtures.js';

const MAILTM_API = 'https://api.mail.tm';

export interface MailTmMessage {
  id: string;
  subject: string;
  intro: string;
  from: { address: string; name: string };
  to: Array<{ address: string; name: string }>;
  seen: boolean;
  createdAt: string;
}

/**
 * Poll a mail.tm inbox for a message matching the subject.
 * Returns the message if found within timeout, null otherwise.
 */
export async function waitForEmail(
  mailTmToken: string,
  subject: string | RegExp,
  timeoutMs = 30_000,
  pollIntervalMs = 2_000,
): Promise<MailTmMessage | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILTM_API}/messages`, {
        headers: { Authorization: `Bearer ${mailTmToken}` },
      });

      if (res.ok) {
        const data = await res.json() as { 'hydra:member': MailTmMessage[] };
        const messages = data['hydra:member'] || [];
        const match = messages.find(m =>
          typeof subject === 'string'
            ? m.subject === subject
            : subject.test(m.subject),
        );
        if (match) return match;
      }
    } catch {
      // Ignore network errors during polling
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  return null;
}

/**
 * Check if a mail.tm inbox has received any email with the given subject.
 * Non-polling, single check.
 */
export async function hasEmail(
  mailTmToken: string,
  subject: string | RegExp,
): Promise<boolean> {
  try {
    const res = await fetch(`${MAILTM_API}/messages`, {
      headers: { Authorization: `Bearer ${mailTmToken}` },
    });

    if (!res.ok) return false;

    const data = await res.json() as { 'hydra:member': MailTmMessage[] };
    const messages = data['hydra:member'] || [];
    return messages.some(m =>
      typeof subject === 'string'
        ? m.subject === subject
        : subject.test(m.subject),
    );
  } catch {
    return false;
  }
}

/**
 * Get all messages in a mail.tm inbox.
 */
export async function getMessages(mailTmToken: string): Promise<MailTmMessage[]> {
  const res = await fetch(`${MAILTM_API}/messages`, {
    headers: { Authorization: `Bearer ${mailTmToken}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);

  const data = await res.json() as { 'hydra:member': MailTmMessage[] };
  return data['hydra:member'] || [];
}

/**
 * Check delivery across multiple sample users.
 * Returns { received, total } count.
 */
export async function checkBulkDelivery(
  users: Array<{ mailTmToken?: string }>,
  subject: string,
  sampleSize = 10,
  timeoutMs = 60_000,
): Promise<{ received: number; total: number }> {
  // Pick a random sample of users to check
  const shuffled = [...users].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(sampleSize, shuffled.length));

  // Collect results into an array to avoid race condition on shared counter
  const results = await Promise.all(
    sample.map(async user => {
      if (!user.mailTmToken) return false;
      return !!(await waitForEmail(user.mailTmToken, subject, timeoutMs));
    }),
  );

  const received = results.filter(Boolean).length;
  return { received, total: sample.length };
}
