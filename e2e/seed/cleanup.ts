import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './lib/config.js';
import { deleteTeableRecordsByEmailDomain } from './lib/teable.js';
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
  console.log(`Cleaning up ${fixtures.users.length} test users...\n`);

  // Delete Teable records
  if (config.teableApiUrl && config.teableToken && config.membersTableId) {
    console.log('1. Deleting Teable records...');
    const deleted = await deleteTeableRecordsByEmailDomain('e2e-test.local');
    console.log(`   Deleted ${deleted} Teable records\n`);
  } else {
    console.log('1. Skipping Teable cleanup (no credentials configured)\n');
  }

  console.log('=== Cleanup Complete ===');
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});