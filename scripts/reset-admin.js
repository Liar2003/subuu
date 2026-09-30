#!/usr/bin/env node
/* Reset the admin password (CLI) — port of reset_admin.php */
import { getDb } from '../src/db.js';
import { hashPassword } from '../src/middleware/auth.js';

const password = process.argv[2] || 'admin123';
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const db = getDb();
db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .run('admin_password_hash', hashPassword(password));
db.prepare('DELETE FROM login_attempts').run();

console.log('Admin password updated.');
