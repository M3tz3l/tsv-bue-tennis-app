import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './lib/config.js';
import { getAvailableDomain, createAccountsBatch, type MailTmAccount } from './lib/mailtm.js';
import { createTeableRecords, deleteTeableRecord } from './lib/teable.js';
import { seedSqlite } from './lib/sqlite.js';
import { generateTestUsers, type TestUser, type TestFixtures } from './lib/fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'test-users.json');

function loadExistingFixtures(): TestFixtures | null {
  if (!existsSync(FIXTURE_PATH)) return null;
  try {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    const fixtures: TestFixtures = JSON.parse(raw);
    // Validate fixture has the expected structure
    if (!fixtures.users || !fixtures.domain || !fixtures.password) return null;
    return fixtures;
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== E2E Test Seed Script ===\n');

  // Validate required env vars
  if (!config.teableApiUrl || !config.teableToken || !config.membersTableId) {
    console.error('Missing required environment variables:');
    console.error('  TEABLE_API_URL, TEABLE_TOKEN, MEMBERS_TABLE_ID');
    process.exit(1);
  }

  // Check for existing fixtures
  const existing = loadExistingFixtures();
  if (existing) {
    console.log(`Found existing fixtures (${existing.users.length} users, generated ${existing.generatedAt})`);
    console.log('Checking what needs to be seeded...\n');
  }

  // Step 1: Get mail.tm domain
  console.log('1. Fetching mail.tm domain...');
  const domain = await getAvailableDomain();
  console.log(`   Domain: ${domain}\n`);

  // Step 2: Generate or load test user fixtures
  let users: TestUser[];
  if (existing && existing.domain === domain) {
    console.log('2. Reusing existing test user fixtures...');
    users = existing.users;
    console.log(`   Loaded ${users.length} users from fixture file\n`);

    // If we need more users than the fixture has, generate additional ones
    if (users.length < config.userCount) {
      const additionalCount = config.userCount - users.length;
      console.log(`   Need ${additionalCount} more users (have ${users.length}, need ${config.userCount})`);
      const allUsers = generateTestUsers(domain);
      const existingEmails = new Set(users.map(u => u.email.toLowerCase()));
      const newUsers = allUsers.filter(u => !existingEmails.has(u.email.toLowerCase()));
      users = [...users, ...newUsers.slice(0, additionalCount)];
      console.log(`   Added ${users.length - existing.users.length} new users, total: ${users.length}\n`);
    }

    // Update orga roles if orgaCount changed (e.g., PR->nightly)
    const currentOrgaCount = users.filter(u => u.role === 'orga').length;
    if (currentOrgaCount !== config.orgaCount) {
      console.log(`   Updating orga roles: ${currentOrgaCount} -> ${config.orgaCount}`);
      // Reset all roles first
      users.forEach(u => u.role = '');
      // Set first N as orga
      for (let i = 0; i < Math.min(config.orgaCount, users.length); i++) {
        users[i].role = 'orga';
      }
      // Delete stale Teable records for users whose role changed so Step 4 recreates them
      for (const user of users) {
        if (user.teableRecordId) {
          try {
            await deleteTeableRecord(user.teableRecordId);
            user.teableRecordId = '';
          } catch {
            // Best effort — will show as duplicate in Teable
          }
        }
      }
      console.log(`   Updated ${Math.min(config.orgaCount, users.length)} users to orga\n`);
    }

    // After role changes, ensure all orga users have mail.tm tokens
    const orgaWithoutToken = users.filter(u => u.role === 'orga' && !u.mailTmToken);
    if (orgaWithoutToken.length > 0) {
      console.log(`   Creating mail.tm accounts for ${orgaWithoutToken.length} orga users missing tokens...`);
      const orgaMailAccounts = await createAccountsBatch(
        orgaWithoutToken.map(u => ({ address: u.email, password: config.testPassword })),
      );
      const accountMap = new Map<string, MailTmAccount>();
      for (const account of orgaMailAccounts) {
        accountMap.set(account.address.toLowerCase(), account);
      }
      for (const user of orgaWithoutToken) {
        const account = accountMap.get(user.email.toLowerCase());
        if (account) user.mailTmToken = account.token;
      }
      console.log(`   Orga mail accounts: ${orgaMailAccounts.length} created\n`);
    }
  } else {
    console.log('2. Generating test user fixtures...');
    users = generateTestUsers(domain);
    console.log(`   Generated ${users.length} users (${config.orgaCount} orga, ${users.length - config.orgaCount} regular)\n`);
  }

  // Step 3: Create mail.tm accounts (skip those that already have tokens)
  const needMailAccounts = users.filter(u => !u.mailTmToken);
  if (needMailAccounts.length === 0) {
    console.log('3. All mail.tm accounts already exist, skipping...\n');
  } else {
    console.log(`3. Creating ${needMailAccounts.length} new mail.tm accounts (${users.length - needMailAccounts.length} already exist)...`);
    const mailAccounts = await createAccountsBatch(
      needMailAccounts.map(u => ({ address: u.email, password: config.testPassword })),
    );

    // Map accounts back to users
    const accountMap = new Map<string, MailTmAccount>();
    for (const account of mailAccounts) {
      accountMap.set(account.address.toLowerCase(), account);
    }

    for (const user of needMailAccounts) {
      const account = accountMap.get(user.email.toLowerCase());
      if (account) {
        user.mailTmToken = account.token;
      }
    }
    console.log(`   Created ${mailAccounts.length} mail.tm accounts\n`);
  }

  // Retry orga users that still lack tokens — they're critical for e2e tests
  let orgaRetries = 0;
  let orgaWithoutToken = users.filter(u => u.role === 'orga' && !u.mailTmToken);
  while (orgaWithoutToken.length > 0 && orgaRetries < 3) {
    orgaRetries++;
    console.log(`   Retrying ${orgaWithoutToken.length} orga users without tokens (attempt ${orgaRetries})...`);
    const orgaMailAccounts = await createAccountsBatch(
      orgaWithoutToken.map(u => ({ address: u.email, password: config.testPassword })),
    );
    const accountMap = new Map<string, MailTmAccount>();
    for (const account of orgaMailAccounts) {
      accountMap.set(account.address.toLowerCase(), account);
    }
    for (const user of orgaWithoutToken) {
      const account = accountMap.get(user.email.toLowerCase());
      if (account) user.mailTmToken = account.token;
    }
    orgaWithoutToken = users.filter(u => u.role === 'orga' && !u.mailTmToken);
  }
  if (orgaWithoutToken.length > 0) {
    console.error(`   WARNING: ${orgaWithoutToken.length} orga users still lack mail.tm tokens after ${orgaRetries} retries`);
  }

  // Step 4: Create Teable records (skip those that already have IDs)
  const needTeable = users.filter(u => !u.teableRecordId);
  if (needTeable.length === 0) {
    console.log('4. All Teable records already exist, skipping...\n');
  } else {
    console.log(`4. Creating ${needTeable.length} new Teable records (${users.length - needTeable.length} already exist)...`);
    const teableIds = await createTeableRecords(needTeable);

    for (const user of needTeable) {
      user.teableRecordId = teableIds.get(user.email.toLowerCase()) || '';
    }
    console.log(`   Created ${teableIds.size} Teable records\n`);
  }

  // Step 5: Seed SQLite (uses INSERT OR IGNORE, so always safe)
  console.log('5. Seeding SQLite auth database...');
  const dbPath = seedSqlite(users.map(u => u.email));
  console.log(`   Database: ${dbPath}\n`);

  // Step 6: Write/update fixture file
  console.log('6. Writing fixture file...');
  mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
  const fixtures: TestFixtures = {
    generatedAt: new Date().toISOString(),
    domain,
    password: config.testPassword,
    users,
  };

  writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
  console.log(`   Fixture: ${FIXTURE_PATH}\n`);

  // Summary
  const withMail = users.filter(u => u.mailTmToken).length;
  const withTeable = users.filter(u => u.teableRecordId).length;
  console.log('=== Seed Complete ===');
  console.log(`  Users: ${users.length}`);
  console.log(`  With mail.tm tokens: ${withMail}/${users.length}`);
  console.log(`  With Teable IDs: ${withTeable}/${users.length}`);
  console.log(`  Orga users: ${config.orgaCount}`);
  console.log(`  mail.tm domain: ${domain}`);
  console.log(`  SQLite DB: ${dbPath}`);
  console.log(`  Fixture file: ${FIXTURE_PATH}`);
  console.log(`  Password: ${config.testPassword}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
