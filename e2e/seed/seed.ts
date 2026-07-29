import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './lib/config.js';
import { createTeableRecords } from './lib/teable.js';
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

  // Step 1: Always generate fresh test users (fixtures from previous runs may be stale)
  console.log('1. Generating test user fixtures...');
  let users = generateTestUsers();

  // Preserve teableRecordIds from existing fixtures if email matches
  const existing = loadExistingFixtures();
  if (existing) {
    const existingByEmail = new Map(existing.users.map(u => [u.email.toLowerCase(), u]));
    for (const user of users) {
      const prev = existingByEmail.get(user.email.toLowerCase());
      if (prev?.teableRecordId) {
        user.teableRecordId = prev.teableRecordId;
      }
    }
    console.log(`   Preserved ${users.filter(u => u.teableRecordId).length} Teable IDs from previous fixtures`);
  }

  console.log(`   Generated ${users.length} users (${config.orgaCount} orga, ${users.length - config.orgaCount} regular)\n`);

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