import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const BCRYPT_COST = 10;

export function seedSqlite(emails: string[]): string {
  // Returns the absolute path of the created database
  const dbPath = config.databasePath;
  const db = new Database(dbPath);

  // Create the details table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create reset_tokens table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES details(id)
    )
  `);

  // Hash password once and reuse for all users
  const hash = bcrypt.hashSync(config.testPassword, BCRYPT_COST);
  const insert = db.prepare('INSERT OR IGNORE INTO details (email, password) VALUES (?, ?)');

  let inserted = 0;
  for (const email of emails) {
    const result = insert.run(email.toLowerCase(), hash);
    if (result.changes > 0) inserted++;
  }

  db.close();
  return dbPath;
}

export function getSqliteUserCount(): number {
  const db = new Database(config.databasePath);
  const row = db.prepare('SELECT COUNT(*) as count FROM details').get() as { count: number };
  db.close();
  return row.count;
}
