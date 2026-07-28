import { setGlobalDispatcher, ProxyAgent } from 'undici';

const PROXY_LIST_URL = 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt';
const TIMEOUT_MS = 5000;
const MAX_PROBES = 10;

let proxyInitialized = false;

/**
 * Fetch a list of public HTTP proxies from a maintained GitHub list,
 * test each against mail.tm, and return the first working one.
 */
async function discoverWorkingProxy(): Promise<string | null> {
  try {
    const res = await fetch(PROXY_LIST_URL);
    if (!res.ok) {
      console.log(`  Proxy list fetch failed: ${res.status}`);
      return null;
    }

    const text = await res.text();
    const proxies = text.trim().split('\n').filter(Boolean).slice(0, MAX_PROBES);
    console.log(`  Testing ${proxies.length} proxies...`);

    for (const [i, proxy] of proxies.entries()) {
      const url = `http://${proxy}`;
      try {
        const agent = new ProxyAgent(url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const testRes = await fetch('https://api.mail.tm/domains', {
          dispatcher: agent,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (testRes.ok) {
          console.log(`  Proxy #${i + 1} works: ${url}`);
          return url;
        }
      } catch {
        // Proxy failed, try next
      }
    }

    console.log('  No working proxy found in tested list');
    return null;
  } catch (err) {
    console.log(`  Proxy discovery error: ${err}`);
    return null;
  }
}

/**
 * Set up a global proxy for all mail.tm requests.
 * Priority: MAILTM_PROXY env var > auto-discovered public proxy > direct.
 *
 * Once called, all subsequent `fetch` calls in this process automatically
 * route through the proxy (via undici's global dispatcher).
 */
export async function ensureMailTmProxy(): Promise<void> {
  if (proxyInitialized) return;
  proxyInitialized = true;

  const envProxy = process.env.MAILTM_PROXY;
  if (envProxy) {
    console.log(`  Using MAILTM_PROXY: ${envProxy}`);
    setGlobalDispatcher(new ProxyAgent(envProxy));
    return;
  }

  console.log('  No MAILTM_PROXY set, probing public proxies...');
  const working = await discoverWorkingProxy();
  if (working) {
    setGlobalDispatcher(new ProxyAgent(working));
  } else {
    console.log('  No proxy available, using direct connection');
  }
}