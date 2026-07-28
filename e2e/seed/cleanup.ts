import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './lib/config.js';
import { deleteTeableRecordsByEmailDomain } from './lib/teable.js';
import { deleteAccount } from './lib/mailtm.js';
import type { TestFixtures } from './lib/fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('=== E2E Test Cleanup ===\n');

  const fixturePath = join(__dirname, 'fixtures', 'test-users.json');

  if (!existsSync(fixturePath)) {
    console.log('No fixture file found, nothing to clean up.');
    return;
  }

  const fixtures: TestFixtures = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  console.log(`Cleaning up ${fixtures.users.length} test users from domain ${fixtures.domain}...\n`);

  // Delete Teable records
  if (config.teableApiUrl && config.teableToken && config.membersTableId) {
    console.log('1. Deleting Teable records...');
    const deleted = await deleteTeableRecordsByEmailDomain(fixtures.domain);
    console.log(`   Deleted ${deleted} Teable records\n`);
  } else {
    console.log('1. Skipping Teable cleanup (no credentials configured)\n');
  }

  // Delete mail.tm accounts
  console.log('2. Deleting mail.tm accounts...');
  let deletedAccounts = 0;
  for (const user of fixtures.users) {
    if (user.mailTmToken) {
      try {
        // We need the account ID, but we stored the token
        // For cleanup, we can just skip mail.tm accounts (they expire)
        // or use the /me endpoint to get the ID
        const res = await fetch(`${config.mailtmApiUrl}/me`, {
          headers: { Authorization: `Bearer ${user.mailTmToken}` },
        });
        if (res.ok) {
          const me = await res.json() as { id: string };
          await deleteAccount(me.id, user.mailTmToken);
          deletedAccounts++;
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
  console.log(`   Deleted ${deletedAccounts} mail.tm accounts\n`);

  console.log('=== Cleanup Complete ===');
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
