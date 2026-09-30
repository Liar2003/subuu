import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { now } from './lib/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export const DB_FILE = process.env.SAVINGS_DB || path.join(ROOT, 'savings.sqlite');
export const BACKUP_DIR = process.env.SAVINGS_BACKUP_DIR || path.join(ROOT, 'backups');

let db = null;

export function getDb() {
  if (!db) db = open();
  return db;
}

function open() {
  const d = new Database(DB_FILE);
  d.pragma('foreign_keys = ON');
  d.pragma('journal_mode = WAL');
  d.pragma('synchronous = NORMAL');
  initSchema(d);
  return d;
}

function initSchema(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      monthly_amount INTEGER NOT NULL DEFAULT 10000,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  d.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      amount INTEGER NOT NULL,
      amount_input TEXT,
      paid INTEGER NOT NULL DEFAULT 1,
      paid_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(member_id, month)
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);');
  d.exec('CREATE INDEX IF NOT EXISTS idx_payments_month  ON payments(month);');
  d.exec('CREATE INDEX IF NOT EXISTS idx_payments_paid   ON payments(paid);');
  d.exec(`
    CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      old_amount INTEGER,
      new_amount INTEGER NOT NULL,
      old_paid INTEGER,
      new_paid INTEGER,
      changed_at TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_history_payment ON payment_history(payment_id);');
  d.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);');
  d.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);');
  d.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      attempted_at TEXT NOT NULL
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_login_ip_time ON login_attempts(ip, attempted_at);');
  d.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      amount_input TEXT,
      reason TEXT NOT NULL,
      spent_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_expenses_spent ON expenses(spent_at);');
  d.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      amount_input TEXT,
      interest INTEGER NOT NULL DEFAULT 0,
      interest_input TEXT,
      borrowed_at TEXT NOT NULL,
      due_date TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_loans_member   ON loans(member_id);');
  d.exec('CREATE INDEX IF NOT EXISTS idx_loans_borrowed ON loans(borrowed_at);');
  d.exec(`
    CREATE TABLE IF NOT EXISTS loan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      amount_input TEXT,
      paid_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    );
  `);
  d.exec('CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);');

  const defaults = {
    default_amount: '10000',
    currency: 'MMK',
    language: 'mm',
    theme: 'system',
    display_mode: 'both',
    group_name: 'Monthly Savings',
  };
  const insSetting = d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(defaults)) insSetting.run(k, v);

  const cur = parseInt(d.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value || '0', 10);

  if (cur < 1) {
    const names = [
      'Ko chit ko', 'zaw Oo', 'Kyaw myint aye', 'toewaoo',
      'min min Aung', 'Kyaw Kyaw Htet', 'arkar', 'min khant kyaw1',
      'min khant kyaw2', 'win Myat tun', 'sai zaw zaw', 'Wai moe',
      'Hein thiha', 'bobo Aung', 'win moe Aung', 'Aung myo thant',
    ];
    const ts = now();
    const insM = d.prepare(
      'INSERT INTO members(name,active,monthly_amount,note,created_at,updated_at) VALUES(?,?,?,?,?,?)'
    );
    const seed = d.transaction(() => {
      for (const n of names) insM.run(n, 1, 10000, null, ts, ts);
      d.prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','1')").run();
    });
    seed();
  }

  if (cur < 2) {
    const hash = bcrypt.hashSync('admin123', 10);
    d.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('admin_password_hash',?)").run(hash);
    d.prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','2')").run();
  }

  if (cur < 3) {
    d.prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','3')").run();
  }
}
