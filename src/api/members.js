import { getDb } from '../db.js';
import { ok, fail, q, qi } from '../lib/http.js';
import { escapeLike, dateAddMonth, now, currentMonth } from '../lib/util.js';
import { parseMyAmount } from '../lib/amount.js';
import { guardAuth, guardPost } from '../middleware/auth.js';

const ALLOWED_SORT = ['id', 'name', 'monthly_amount', 'active', 'created_at'];

export function members(req, res) {
  const db = getDb();
  const action = q(req, 'action', 'list');

  if (req.method === 'POST' && action === 'save') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const body = req.body || {};
    const id = parseInt(body.id || 0, 10) || 0;
    const name = String(body.name || '').trim();
    let amount = body.monthly_amount;
    amount = typeof amount === 'string' ? (parseMyAmount(amount) ?? 0) : (parseInt(amount, 10) || 0);
    const active = body.active ? 1 : 0;
    const note = body.note != null ? String(body.note) : null;
    if (!name) return fail(res, 'Name required');
    if (amount <= 0) return fail(res, 'Monthly amount must be > 0');
    const ts = now();
    if (id > 0) {
      db.prepare('UPDATE members SET name=?,monthly_amount=?,active=?,note=?,updated_at=? WHERE id=?')
        .run(name, amount, active, note, ts, id);
      return ok(res, { id });
    }
    const info = db
      .prepare('INSERT INTO members(name,active,monthly_amount,note,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(name, active, amount, note, ts, ts);
    return ok(res, { id: Number(info.lastInsertRowid) });
  }

  if (req.method === 'POST' && action === 'delete') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const id = qi(req, 'id', 0);
    if (id <= 0) return fail(res, 'Invalid id');
    db.prepare('DELETE FROM members WHERE id=?').run(id);
    return ok(res, { id });
  }

  if (req.method === 'POST' && action === 'toggle') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const id = qi(req, 'id', 0);
    db.prepare('UPDATE members SET active = 1 - active, updated_at=? WHERE id=?').run(now(), id);
    return ok(res);
  }

  const search = String(q(req, 'q', '') || '').trim();
  const active = q(req, 'active', null);
  let sort = String(q(req, 'sort', 'name') || 'name');
  if (!ALLOWED_SORT.includes(sort)) sort = 'name';
  const dir = String(q(req, 'dir', 'asc') || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const args = [];
  let sql = `SELECT m.*,
    (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.member_id=m.id AND p.paid=1) AS total_saved,
    (SELECT COUNT(*) FROM payments p WHERE p.member_id=m.id AND p.paid=1) AS paid_months
    FROM members m WHERE 1=1`;
  if (search) {
    sql += ` AND m.name LIKE ? ESCAPE '\\'`;
    args.push('%' + escapeLike(search) + '%');
  }
  if (active === '1' || active === '0') {
    sql += ' AND m.active=?';
    args.push(parseInt(active, 10));
  }
  sql += ` ORDER BY m.${sort} ${dir}, m.id ASC`;

  return ok(res, { items: db.prepare(sql).all(...args) });
}

export function member(req, res) {
  const id = qi(req, 'id', 0);
  if (id <= 0) return fail(res, 'Invalid id');
  const db = getDb();
  const mem = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!mem) return fail(res, 'Not found', 404);

  const payments = db.prepare('SELECT * FROM payments WHERE member_id=? ORDER BY month DESC').all(id);
  const paidMap = new Map(payments.map((p) => [p.month, p]));

  let earliest = null;
  if (payments.length) {
    earliest = payments.map((p) => p.month).sort()[0];
  }
  const start = earliest || currentMonth();
  const end = currentMonth();
  const months = [];
  let cursor = start;
  while (cursor.localeCompare(end) <= 0) {
    months.push(cursor);
    cursor = dateAddMonth(cursor, 1);
  }

  const expected = mem.monthly_amount;
  const rows = [];
  for (const mo of months) {
    const p = paidMap.get(mo);
    if (p) {
      rows.push({
        month: mo,
        paid: 1,
        amount: p.amount,
        amount_input: p.amount_input,
        paid_at: p.paid_at,
        note: p.note,
        id: p.id,
        expected,
      });
    } else {
      rows.push({ month: mo, paid: 0, amount: 0, expected });
    }
  }

  const paidRows = rows.filter((r) => r.paid);
  const totalSaved = paidRows.reduce((a, r) => a + r.amount, 0);
  const paidMonths = paidRows.length;
  const expectedMonths = rows.length;
  const totals = {
    total_saved: totalSaved,
    paid_months: paidMonths,
    expected_months: expectedMonths,
    unpaid_months: expectedMonths - paidMonths,
    avg: paidMonths > 0 ? Math.round(totalSaved / paidMonths) : 0,
    rate: expectedMonths > 0 ? Math.round((paidMonths * 10000) / expectedMonths) / 100 : 0,
  };

  return ok(res, { member: mem, months: rows, totals });
}

export function search(req, res) {
  const db = getDb();
  const term = String(q(req, 'q', '') || '').trim();
  if (!term) return ok(res, { members: [], payments: [] });
  const like = '%' + escapeLike(term) + '%';
  const ms = db
    .prepare("SELECT id,name,monthly_amount,active FROM members WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 20")
    .all(like);
  const ps = db
    .prepare(`SELECT p.*, m.name AS member_name FROM payments p
      JOIN members m ON m.id=p.member_id
      WHERE p.note LIKE ? ESCAPE '\\' OR p.amount_input LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\'
      ORDER BY p.month DESC LIMIT 50`)
    .all(like, like, like);
  return ok(res, { members: ms, payments: ps });
}
