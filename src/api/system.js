import { getDb } from '../db.js';
import { ok, fail, q, bval } from '../lib/http.js';
import { parseMyAmount } from '../lib/amount.js';
import {
  getSetting, setSetting, isAuthed, guardAuth, guardPost,
  tooManyAttempts, recordAttempt, hashPassword, verifyPassword,
} from '../middleware/auth.js';

const SETTING_KEYS = ['default_amount', 'currency', 'language', 'theme', 'display_mode', 'group_name'];

export function settings(req, res) {
  const db = getDb();
  if (req.method === 'POST') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const body = req.body || {};
    const up = db.prepare(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    for (const key of SETTING_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      let value = String(body[key]);
      if (key === 'default_amount') {
        const parsed = parseMyAmount(value);
        if (parsed === null || parsed < 0) return fail(res, 'Invalid default amount');
        value = String(parsed);
      }
      up.run(key, value);
    }
  }
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const out = {};
  for (const r of rows) {
    if (r.key === 'admin_password_hash') continue;
    out[r.key] = r.value;
  }
  return ok(res, out);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export async function login(req, res) {
  if (!guardPost(req, res)) return;
  const ip = req.ip || '0.0.0.0';
  if (tooManyAttempts(ip)) {
    return fail(res, 'Too many attempts. Please wait a few minutes.', 429);
  }
  const password = String(bval(req, 'password', '') || '');
  if (!password) {
    recordAttempt(ip, false);
    return fail(res, 'Invalid password');
  }
  let hash = getSetting('admin_password_hash', '');
  if (!hash) {
    hash = hashPassword('admin123');
    setSetting('admin_password_hash', hash);
  }
  if (!verifyPassword(password, hash)) {
    recordAttempt(ip, false);
    return fail(res, 'Invalid password');
  }
  recordAttempt(ip, true);
  try {
    await regenerateSession(req);
  } catch {
    return fail(res, 'Server error', 500);
  }
  req.session.auth_ok = true;
  req.session.auth_at = Math.floor(Date.now() / 1000);
  return ok(res, { auth: true });
}

export function logout(req, res) {
  return req.session.destroy(() => ok(res, { auth: false }));
}

export function authStatus(req, res) {
  return ok(res, { auth: isAuthed(req) });
}

export function changePassword(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const current = String(bval(req, 'current', '') || '');
  const next = String(bval(req, 'new', '') || '');
  if (next.length < 6) return fail(res, 'New password must be at least 6 characters');
  const hash = getSetting('admin_password_hash', '');
  if (!hash || !verifyPassword(current, hash)) return fail(res, 'Current password is incorrect');
  setSetting('admin_password_hash', hashPassword(next));
  return ok(res, { changed: true });
}

export function parse(req, res) {
  const value = String(q(req, 'v', '') || q(req, 'value', '') || '');
  return ok(res, { value, amount: parseMyAmount(value) });
}
