import { getDb } from '../db.js';
import { ok, fail, q, qi, bval } from '../lib/http.js';
import { isMonth, now, today } from '../lib/util.js';
import { parseMyAmount } from '../lib/amount.js';
import { guardAuth, guardPost } from '../middleware/auth.js';

export function payments(req, res) {
  const db = getDb();
  const month = q(req, 'month', null);
  const memberId = qi(req, 'member_id', 0);
  const status = q(req, 'status', null);

  const args = [];
  let sql = `SELECT p.*, m.name AS member_name, m.monthly_amount AS expected_amount
             FROM payments p JOIN members m ON m.id=p.member_id WHERE 1=1`;
  if (month) { sql += ' AND p.month=?'; args.push(month); }
  if (memberId > 0) { sql += ' AND p.member_id=?'; args.push(memberId); }
  if (status === 'paid' || status === 'unpaid') {
    sql += ' AND p.paid=?';
    args.push(status === 'paid' ? 1 : 0);
  }
  sql += ' ORDER BY p.month DESC, m.id ASC';
  return ok(res, { items: db.prepare(sql).all(...args) });
}

export function savePayment(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const db = getDb();
  const body = req.body || {};
  const memberId = parseInt(body.member_id || 0, 10) || 0;
  const month = String(body.month || '');
  const amountIn = String(body.amount ?? '');
  const paidAt = String(body.paid_at || today());
  const note = body.note != null ? String(body.note) : null;
  const forceUnpaid = !!body.unpaid;
  const id = parseInt(body.id || 0, 10) || 0;

  if (memberId <= 0) return fail(res, 'member_id required');
  if (!isMonth(month)) return fail(res, 'month must be YYYY-MM');

  let amount = parseMyAmount(amountIn);
  const isPaid = !forceUnpaid && amount != null && amount > 0;
  if (!isPaid) amount = amount ?? 0;

  const ts = now();
  const tx = db.transaction(() => {
    let existing = null;
    if (id > 0) existing = db.prepare('SELECT * FROM payments WHERE id=?').get(id);
    if (!existing) {
      existing = db.prepare('SELECT * FROM payments WHERE member_id=? AND month=?').get(memberId, month);
    }
    if (existing) {
      const oldAmount = existing.amount;
      const oldPaid = existing.paid;
      if (isPaid) {
        db.prepare('UPDATE payments SET amount=?, amount_input=?, paid=1, paid_at=?, note=?, updated_at=? WHERE id=?')
          .run(amount, amountIn, paidAt, note, ts, existing.id);
      } else {
        db.prepare('UPDATE payments SET amount=0, amount_input=?, paid=0, paid_at=NULL, note=?, updated_at=? WHERE id=?')
          .run(amountIn, note, ts, existing.id);
      }
      db.prepare(`INSERT INTO payment_history(payment_id,member_id,month,old_amount,new_amount,old_paid,new_paid,changed_at)
                  VALUES(?,?,?,?,?,?,?,?)`)
        .run(existing.id, memberId, month, oldAmount, isPaid ? amount : 0, oldPaid, isPaid ? 1 : 0, ts);
      return { id: existing.id, updated: true };
    }
    const info = db
      .prepare(`INSERT INTO payments(member_id,month,amount,amount_input,paid,paid_at,note,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(memberId, month, isPaid ? amount : 0, amountIn, isPaid ? 1 : 0, isPaid ? paidAt : null, note, ts, ts);
    const newId = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO payment_history(payment_id,member_id,month,old_amount,new_amount,old_paid,new_paid,changed_at)
                VALUES(?,?,?,?,?,?,?,?)`)
      .run(newId, memberId, month, null, isPaid ? amount : 0, null, isPaid ? 1 : 0, ts);
    return { id: newId, created: true };
  });

  try {
    return ok(res, tx());
  } catch (e) {
    return fail(res, 'Save failed: ' + e.message, 500);
  }
}

export function deletePayment(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const id = parseInt(bval(req, 'id', 0) || 0, 10) || 0;
  if (id <= 0) return fail(res, 'id required');
  getDb().prepare('DELETE FROM payments WHERE id=?').run(id);
  return ok(res);
}

export function bulkPay(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const db = getDb();
  const body = req.body || {};
  const month = String(body.month || '');
  const ids = Array.isArray(body.member_ids) ? body.member_ids : [];
  const amountIn = String(body.amount ?? '');
  const paidAt = String(body.paid_at || today());

  if (!isMonth(month)) return fail(res, 'month required');
  let parsed = null;
  if (amountIn.trim() !== '') {
    parsed = parseMyAmount(amountIn);
    if (parsed === null || parsed <= 0) return fail(res, 'Valid amount required');
  }

  const ts = now();
  let saved = 0;
  const sel = db.prepare('SELECT id, monthly_amount FROM members WHERE id=?');
  const prevStmt = db.prepare('SELECT id,amount,paid FROM payments WHERE member_id=? AND month=?');
  const ins = db.prepare(`INSERT INTO payments(member_id,month,amount,amount_input,paid,paid_at,note,created_at,updated_at)
      VALUES(?,?,?,?,1,?,NULL,?,?)
      ON CONFLICT(member_id,month) DO UPDATE SET amount=excluded.amount, amount_input=excluded.amount_input,
      paid=1, paid_at=excluded.paid_at, updated_at=excluded.updated_at`);
  const hist = db.prepare(`INSERT INTO payment_history(payment_id,member_id,month,old_amount,new_amount,old_paid,new_paid,changed_at)
      VALUES((SELECT id FROM payments WHERE member_id=? AND month=?),?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    for (const raw of ids) {
      const mid = parseInt(raw, 10) || 0;
      const m = sel.get(mid);
      if (!m) continue;
      const use = parsed === null ? m.monthly_amount : parsed;
      const prev = prevStmt.get(mid, month);
      ins.run(mid, month, use, amountIn, paidAt, ts, ts);
      hist.run(mid, month, mid, month, prev ? prev.amount : null, use, prev ? prev.paid : null, 1, ts);
      saved++;
    }
  });

  try {
    tx();
  } catch {
    return fail(res, 'Bulk save failed', 500);
  }
  return ok(res, { saved });
}
