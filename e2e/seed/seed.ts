import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './lib/config.js';
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
    if (!fixtures.users || !fixtures.password) return null;
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

  // Step 1: Load or generate test user fixtures
  const existing = loadExistingFixtures();
  let users: TestUser[];

  if (existing) {
    console.log(`1. Loaded existing fixtures (${existing.users.length} users, generated ${existing.generatedAt})`);
    users = existing.users;

    // If we need more users than the fixture has, generate additional ones
    if (users.length < config.userCount) {
      const additionalCount = config.userCount - users.length;
      console.log(`   Need ${additionalCount} more users (have ${users.length}, need ${config.userCount})`);
      const allUsers = generateTestUsers();
      const existingEmails = new Set(users.map(u => u.email.toLowerCase()));
      const newUsers = allUsers.filter(u => !existingEmails.has(u.email.toLowerCase()));
      users = [...users, ...newUsers.slice(0, additionalCount)];
      console.log(`   Added ${users.length - existing.users.length} new users, total: ${users.length}`);
    }

    // Update orga roles if orgaCount changed (e.g., PR->nightly)
    const currentOrgaCount = users.filter(u => u.role === 'orga').length;
    if (currentOrgaCount !== config.orgaCount) {
      console.log(`   Updating orga roles: ${currentOrgaCount} -> ${config.orgaCount}`);
      users.forEach(u => u.role = '');
      for (let i = 0; i < Math.min(config.orgaCount, users.length); i++) {
        users[i].role = 'orga';
      }
      // Delete stale Teable records for role-changed users so Step 2 recreates them
      for (const user of users) {
        if (user.teableRecordId) {
          try {
            await deleteTeableRecord(user.teableRecordId);
            user.teableRecordId = '';
          } catch {
            // Best effort
          }
        }
      }
      console.log(`   Updated ${Math.min(config.orgaCount, users.length)} users to orga`);
    }
    console.log('');
  } else {
    console.log('1. Generating test user fixtures...');
    users = generateTestUsers();
    console.log(`   Generated ${users.length} users (${config.orgaCount} orga, ${users.length - config.orgaCount} regular)\n`);
  }

  // Step 2: Create Teable records (skip those that already have IDs)
  const needTeable = users.filter(u => !u.teableRecordId);
  if (needTeable.length === 0) {
    console.log('2. All Teable records already exist, skipping...\n');
  } else {
    console.log(`2. Creating ${needTeable.length} Teable records (${users.length - needTeable.length} already exist)...`);
    const teableIds = await createTeableRecords(needTeable);

    for (const user of needTeable) {
      user.teableRecordId = teableIds.get(user.email.toLowerCase()) || '';
    }
    console.log(`   Created ${teableIds.size} Teable records\n`);
  }

  // Step 3: Seed SQLite (uses INSERT OR IGNORE, so always safe)
  console.log('3. Seeding SQLite auth database...');
  const dbPath = seedSqlite(users.map(u => u.email));
  console.log(`   Database: ${dbPath}\n`);

  // Step 4: Write/update fixture file
  console.log('4. Writing fixture file...');
  mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
  const fixtures: TestFixtures = {
    generatedAt: new Date().toISOString(),
    password: config.testPassword,
    users,
  };

  writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
  console.log(`   Fixture: ${FIXTURE_PATH}\n`);

  // Summary
  const withTeable = users.filter(u => u.teableRecordId).length;
  console.log('=== Seed Complete ===');
  console.log(`  Users: ${users.length}`);
  console.log(`  With Teable IDs: ${withTeable}/${users.length}`);
  console.log(`  Orga users: ${config.orgaCount}`);
  console.log(`  SQLite DB: ${dbPath}`);
  console.log(`  Fixture file: ${FIXTURE_PATH}`);
  console.log(`  Password: ${config.testPassword}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});