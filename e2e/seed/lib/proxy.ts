import { setGlobalDispatcher, ProxyAgent } from 'undici';

const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all',
  'https://www.proxy-list.download/api/v1/get?type=http&anon=elite',
];

const TIMEOUT_MS = 5000;
const MAX_PROBES = 50;

let proxyInitialized = false;

async function fetchProxyList(): Promise<string[]> {
  for (const url of PROXY_SOURCES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const text = await res.text();
      // Each source may have different delimiters (newline vs CRLF, optional port after colon)
      const proxies = text.split('\n')
        .map(l => l.trim())
        .filter(l => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(l));
      if (proxies.length > 0) {
        console.log(`  Fetched ${proxies.length} proxies from ${url.split('/')[2]}`);
        return proxies;
      }
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Test multiple proxies in parallel batches.
 * Returns the first working proxy URL, or null.
 */
async function discoverWorkingProxy(): Promise<string | null> {
  const proxies = await fetchProxyList();
  const toTest = proxies.slice(0, MAX_PROBES);
  if (toTest.length === 0) {
    console.log('  No proxies found from any source');
    return null;
  }

  console.log(`  Testing up to ${toTest.length} proxies (${TIMEOUT_MS}ms timeout each)...`);

  // Test in batches of 5 to avoid overwhelming the network
  const BATCH = 5;
  for (let batchStart = 0; batchStart < toTest.length; batchStart += BATCH) {
    const batch = toTest.slice(batchStart, batchStart + BATCH);

    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        const url = `http://${proxy}`;
        const agent = new ProxyAgent(url);
        const res = await fetch('https://api.mail.tm/domains', {
          dispatcher: agent,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return url;
        throw new Error(`Status ${res.status}`);
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const success = result.value.replace(/^http:\/\//, '');
        console.log(`  Proxy works: ${success}`);
        return result.value;
      }
    }

    if (batchStart + BATCH < toTest.length) {
      process.stderr.write('.');
    }
  }
  process.stderr.write('\n');

  console.log('  No working proxy found');
  return null;
}

/**
 * Set up a global proxy for all mail.tm requests.
 * Priority: MAILTM_PROXY env var > auto-discovered public proxy > direct.
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