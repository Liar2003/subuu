import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { now } from '../lib/util.js';

export function isAuthed(req) {
  return !!(req.session && req.session.auth_ok === true);
}

/** Returns true when the request may proceed; otherwise sends a 401 and returns false. */
export function guardAuth(req, res) {
  if (!isAuthed(req)) {
    res.status(401).json({
      success: false,
      error: 'auth_required',
      message: 'Admin login required',
    });
    return false;
  }
  return true;
}

/** Returns true for POST requests; otherwise sends a 405 and returns false. */
export function guardPost(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'POST required' });
    return false;
  }
  return true;
}

export function tooManyAttempts(ip) {
  const db = getDb();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE ip=? AND success=0 AND attempted_at>=?')
    .get(ip, since);
  return (row?.c || 0) >= 8;
}

export function recordAttempt(ip, success) {
  getDb()
    .prepare('INSERT INTO login_attempts(ip,success,attempted_at) VALUES(?,?,?)')
    .run(ip, success ? 1 : 0, now());
}

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

/** bcryptjs understands $2a/$2b; PHP emits $2y$ — same algorithm. */
export function verifyPassword(pw, hash) {
  if (!hash) return false;
  const normalized = hash.replace(/^\$2y\$/, '$2b$');
  try {
    return bcrypt.compareSync(pw, normalized);
  } catch {
    return false;
  }
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, value);
}
