import { config as loadDotenv } from 'dotenv';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

// Load env vars from scripts/.env (project root env file)
loadDotenv({ path: join(PROJECT_ROOT, 'scripts', '.env') });

export const config = {
  // Backend
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
  databasePath: process.env.E2E_DATABASE_PATH || join(PROJECT_ROOT, 'backend', 'e2e_test.db'),

  // Teable
  teableApiUrl: process.env.TEABLE_API_URL || '',
  teableToken: process.env.TEABLE_TOKEN || '',
  membersTableId: process.env.MEMBERS_TABLE_ID || '',

  // mail.tm
  mailtmApiUrl: 'https://api.mail.tm',

  // Test credentials
  testPassword: 'Test1234!',
  userCount: parseInt(process.env.E2E_USER_COUNT || '20', 10),
  orgaCount: parseInt(process.env.E2E_ORGA_COUNT || '2', 10),
  emailPrefix: process.env.E2E_EMAIL_PREFIX || 'e2ev2',
};
