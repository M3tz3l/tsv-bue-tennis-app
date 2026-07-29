const MAILPIT_API = process.env.MAILPIT_API_URL || 'http://localhost:8025';

export interface MailpitMessage {
  id: string;
  subject: string;
  from: Array<{ name: string; address: string }>;
  to: Array<{ name: string; address: string }>;
  created: string;
  text?: string;
  html?: string;
}

interface MailpitListResponse {
  total: number;
  unread: number;
  messages: MailpitMessage[];
}

/**
 * Normalize a raw Mailpit API message (PascalCase keys) to our camelCase interface.
 * Mailpit returns { ID, Subject, From: { Name, Address }, To: [...], Created, ... }
 * but the rest of the code expects { id, subject, from: { name, address }, ... }.
 */
function normalizeMessage(raw: any): MailpitMessage {
  const normalizeAddr = (a: any) => ({ name: a.Name ?? a.name ?? '', address: a.Address ?? a.address ?? '' });
  const rawFrom = raw.From ?? raw.from;
  const from = Array.isArray(rawFrom) ? rawFrom.map(normalizeAddr) : [normalizeAddr(rawFrom ?? {})];
  const rawTo = raw.To ?? raw.to;
  const to = Array.isArray(rawTo) ? rawTo.map(normalizeAddr) : [normalizeAddr(rawTo ?? {})];
  return {
    id: raw.ID ?? raw.id ?? '',
    subject: raw.Subject ?? raw.subject ?? '',
    from,
    to,
    created: raw.Created ?? raw.created ?? '',
    text: raw.Text ?? raw.text,
    html: raw.HTML ?? raw.html,
  };
}

/**
 * Poll Mailpit for a message matching a recipient and subject.
 * Returns the message if found within timeout, null otherwise.
 */
export async function waitForEmail(
  toAddress: string,
  subject: string | RegExp,
  timeoutMs = 30_000,
  pollIntervalMs = 2_000,
): Promise<MailpitMessage | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/api/v1/messages?start=0&limit=50`);
      if (res.ok) {
        const raw = await res.json() as any;
        const messages: MailpitMessage[] = (raw.messages ?? []).map(normalizeMessage);
        const match = messages.find(m => {
          const addrMatch = m.to.some(t => t.address.toLowerCase() === toAddress.toLowerCase());
          const subjMatch = typeof subject === 'string'
            ? m.subject === subject
            : subject.test(m.subject);
          return addrMatch && subjMatch;
        });
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
 * Get all messages from Mailpit.
 */
export async function getAllMessages(): Promise<MailpitMessage[]> {
  try {
    const res = await fetch(`${MAILPIT_API}/api/v1/messages?start=0&limit=200`);
    if (!res.ok) return [];
    const raw = await res.json() as any;
    return (raw.messages ?? []).map(normalizeMessage);
  } catch {
    return [];
  }
}

/**
 * Get full message details including body text/html.
 */
export async function getMessageById(id: string): Promise<MailpitMessage | null> {
  try {
    const res = await fetch(`${MAILPIT_API}/api/v1/message/${id}`);
    if (!res.ok) return null;
    const raw = await res.json();
    return normalizeMessage(raw);
  } catch {
    return null;
  }
}

/**
 * Check delivery across multiple recipients.
 * Returns { received, total } — how many of the sampled recipients got the email.
 */
export async function checkBulkDelivery(
  recipients: string[],
  subject: string,
  sampleSize = 10,
  timeoutMs = 60_000,
): Promise<{ received: number; total: number }> {
  const deadline = Date.now() + timeoutMs;
  const sample = [...recipients]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(sampleSize, recipients.length));

  // Poll until all recipients have received or timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/api/v1/messages?start=0&limit=200`);
      if (res.ok) {
        const raw = await res.json() as any;
        const messages: MailpitMessage[] = (raw.messages ?? []).map(normalizeMessage);
        const matchingMessages = messages.filter(m => m.subject === subject);
        const deliveredAddresses = new Set(
          matchingMessages.flatMap(m => m.to.map(t => t.address.toLowerCase())),
        );
        const received = sample.filter(r => deliveredAddresses.has(r.toLowerCase())).length;

        if (received >= Math.ceil(sample.length * 0.5)) {
          return { received, total: sample.length };
        }
      }
    } catch {
      // Ignore network errors
    }

    await new Promise(r => setTimeout(r, 2_000));
  }

  // Final count after timeout
  const res = await fetch(`${MAILPIT_API}/api/v1/messages?start=0&limit=200`);
  if (res.ok) {
    const raw = await res.json() as any;
    const messages: MailpitMessage[] = (raw.messages ?? []).map(normalizeMessage);
    const matchingMessages = messages.filter(m => m.subject === subject);
    const deliveredAddresses = new Set(
      matchingMessages.flatMap(m => m.to.map(t => t.address.toLowerCase())),
    );
    const received = sample.filter(r => deliveredAddresses.has(r.toLowerCase())).length;
    return { received, total: sample.length };
  }

  return { received: 0, total: sample.length };
}

/**
 * Delete all messages from Mailpit.
 */
export async function deleteAllMessages(): Promise<void> {
  try {
    await fetch(`${MAILPIT_API}/api/v1/messages`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore
  }
}
