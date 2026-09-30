import { getDb } from '../db.js';
import { ok, fail, q, qi, bval } from '../lib/http.js';
import { now, today } from '../lib/util.js';
import { parseMyAmount } from '../lib/amount.js';
import { guardAuth, guardPost } from '../middleware/auth.js';

const IS_DATE = /^\d{4}-\d{2}-\d{2}$/;

function decorate(row) {
  const amount = Number(row.amount);
  const interest = Number(row.interest || 0);
  const repaid = Number(row.repaid || 0);
  const total_due = amount + interest;
  const outstanding = Math.max(0, total_due - repaid);
  return {
    ...row,
    amount,
    interest,
    repaid,
    total_due,
    outstanding,
    status: repaid >= total_due ? 'paid' : 'active',
  };
}

export function loans(req, res) {
  const db = getDb();
  const action = String(q(req, 'action', 'list') || 'list');

  if (req.method === 'POST' && action === 'save') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const body = req.body || {};
    const id = parseInt(body.id || 0, 10) || 0;
    const memberId = parseInt(body.member_id || 0, 10) || 0;
    const amountIn = String(body.amount ?? '');
    const interestIn = String(body.interest ?? '').trim();
    const borrowedAt = String(body.borrowed_at || today());
    const dueDate = String(body.due_date || '').trim();
    const note = body.note != null ? String(body.note) : null;

    if (memberId <= 0) return fail(res, 'member_id required');
    const member = db.prepare('SELECT id FROM members WHERE id=?').get(memberId);
    if (!member) return fail(res, 'Member not found');
    if (!IS_DATE.test(borrowedAt)) return fail(res, 'borrowed_at must be YYYY-MM-DD');
    if (dueDate && !IS_DATE.test(dueDate)) return fail(res, 'due_date must be YYYY-MM-DD');

    const principal = parseMyAmount(amountIn);
    if (principal === null || principal <= 0) return fail(res, 'Valid amount required');

    let interest = 0;
    if (interestIn) {
      interest = parseMyAmount(interestIn);
      if (interest === null || interest < 0) return fail(res, 'Valid interest required');
    }

    const ts = now();
    if (id > 0) {
      const existing = db.prepare('SELECT id FROM loans WHERE id=?').get(id);
      if (!existing) return fail(res, 'Loan not found', 404);
      db.prepare('UPDATE loans SET member_id=?, amount=?, amount_input=?, interest=?, interest_input=?, borrowed_at=?, due_date=?, note=?, updated_at=? WHERE id=?')
        .run(memberId, principal, amountIn, interest, interestIn || null, borrowedAt, dueDate || null, note, ts, id);
      return ok(res, { id, updated: true });
    }
    const info = db
      .prepare('INSERT INTO loans(member_id,amount,amount_input,interest,interest_input,borrowed_at,due_date,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(memberId, principal, amountIn, interest, interestIn || null, borrowedAt, dueDate || null, note, ts, ts);
    return ok(res, { id: Number(info.lastInsertRowid), created: true });
  }

  if (req.method === 'POST' && action === 'delete') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const id = qi(req, 'id', 0);
    if (id <= 0) return fail(res, 'id required');
    db.prepare('DELETE FROM loans WHERE id=?').run(id);
    return ok(res, { id });
  }

  const memberId = qi(req, 'member_id', 0);
  const status = String(q(req, 'status', '') || '');

  const args = [];
  let sql = `SELECT l.*, m.name AS member_name,
      COALESCE((SELECT SUM(amount) FROM loan_payments lp WHERE lp.loan_id=l.id),0) AS repaid
    FROM loans l JOIN members m ON m.id=l.member_id WHERE 1=1`;
  if (memberId > 0) { sql += ' AND l.member_id=?'; args.push(memberId); }
  sql += ' ORDER BY l.borrowed_at DESC, l.id DESC';

  const all = db.prepare(sql).all(...args).map(decorate);
  const payStmt = db.prepare('SELECT * FROM loan_payments WHERE loan_id=? ORDER BY paid_at DESC, id DESC');

  const items = (status === 'active' || status === 'paid' ? all.filter((l) => l.status === status) : all)
    .map((l) => ({ ...l, payments: payStmt.all(l.id) }));

  const summary = {
    total_borrowed: all.reduce((a, l) => a + l.amount, 0),
    total_interest: all.reduce((a, l) => a + l.interest, 0),
    total_repaid: all.reduce((a, l) => a + l.repaid, 0),
    outstanding: all.reduce((a, l) => a + l.outstanding, 0),
    active_count: all.filter((l) => l.status === 'active').length,
    paid_count: all.filter((l) => l.status === 'paid').length,
  };

  return ok(res, { items, summary });
}

export function saveLoanPayment(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const db = getDb();
  const body = req.body || {};
  const loanId = parseInt(body.loan_id || 0, 10) || 0;
  const amountIn = String(body.amount ?? '');
  const paidAt = String(body.paid_at || today());
  const note = body.note != null ? String(body.note) : null;

  if (loanId <= 0) return fail(res, 'loan_id required');
  const loan = db.prepare('SELECT id FROM loans WHERE id=?').get(loanId);
  if (!loan) return fail(res, 'Loan not found', 404);
  if (!IS_DATE.test(paidAt)) return fail(res, 'paid_at must be YYYY-MM-DD');

  const parsed = parseMyAmount(amountIn);
  if (parsed === null || parsed <= 0) return fail(res, 'Valid amount required');

  const row = db.prepare(`SELECT l.amount + l.interest - COALESCE((SELECT SUM(amount) FROM loan_payments lp WHERE lp.loan_id=l.id),0) AS o
    FROM loans l WHERE l.id=?`).get(loanId);
  const outstanding = Math.max(0, Number(row.o));
  if (parsed > outstanding) return fail(res, `Amount exceeds outstanding balance (${outstanding})`);

  const ts = now();
  const info = db
    .prepare('INSERT INTO loan_payments(loan_id,amount,amount_input,paid_at,note,created_at) VALUES(?,?,?,?,?,?)')
    .run(loanId, parsed, amountIn, paidAt, note, ts);
  return ok(res, { id: Number(info.lastInsertRowid), loan_id: loanId, created: true });
}

export function deleteLoanPayment(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const id = parseInt(bval(req, 'id', 0) || 0, 10) || 0;
  if (id <= 0) return fail(res, 'id required');
  getDb().prepare('DELETE FROM loan_payments WHERE id=?').run(id);
  return ok(res, { id });
}
