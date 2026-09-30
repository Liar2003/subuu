import { getDb } from '../db.js';
import { ok, fail, q, qi } from '../lib/http.js';
import { now, today } from '../lib/util.js';
import { parseMyAmount } from '../lib/amount.js';
import { getSetting, guardAuth, guardPost } from '../middleware/auth.js';

function scalar(db, sql, ...args) {
  const row = db.prepare(sql).get(...args);
  return row ? Object.values(row)[0] : 0;
}

export function dashboard(req, res) {
  const db = getDb();
  const month = String(q(req, 'month', null) || new Date().toISOString().slice(0, 7));
  const year = String(q(req, 'year', null) || String(new Date().getUTCFullYear()));

  const totalMembers = Number(scalar(db, 'SELECT COUNT(*) FROM members'));
  const activeMembers = Number(scalar(db, 'SELECT COUNT(*) FROM members WHERE active=1'));
  const expectedActive = Number(scalar(db, 'SELECT COALESCE(SUM(monthly_amount),0) FROM members WHERE active=1'));
  const defaultAmount = Number(getSetting('default_amount', '10000') || 10000);

  const cur = db
    .prepare('SELECT COALESCE(SUM(amount),0) AS collected, COUNT(*) AS paid_cnt FROM payments WHERE month=? AND paid=1')
    .get(month);
  const collected = Number(cur.collected);
  const paidCnt = Number(cur.paid_cnt);

  const allTime = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid=1'));
  const totalSpent = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM expenses'));
  const totalBorrowed = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM loans'));
  const totalLoanInterest = Number(scalar(db, 'SELECT COALESCE(SUM(interest),0) FROM loans'));
  const totalRepaid = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM loan_payments'));
  const outstandingLoans = Number(scalar(db, `SELECT COALESCE(SUM(o),0) FROM (
      SELECT MAX(0, l.amount + l.interest - COALESCE((SELECT SUM(amount) FROM loan_payments lp WHERE lp.loan_id=l.id),0)) AS o
      FROM loans l
    )`));
  const activeLoans = Number(scalar(db, `SELECT COUNT(*) FROM loans l
    WHERE l.amount + l.interest > COALESCE((SELECT SUM(amount) FROM loan_payments lp WHERE lp.loan_id=l.id),0)`));
  const paidLoans = Number(scalar(db, 'SELECT COUNT(*) FROM loans')) - activeLoans;
  const available = allTime - totalSpent - totalBorrowed + totalRepaid;
  const spentThisMonth = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM expenses WHERE substr(spent_at,1,7)=?', month));
  const spentThisYear = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM expenses WHERE substr(spent_at,1,4)=?', year));
  const yearTotal = Number(scalar(db, 'SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid=1 AND substr(month,1,4)=?', year));

  const recentExpenses = db
    .prepare('SELECT * FROM expenses ORDER BY spent_at DESC, id DESC LIMIT 5')
    .all()
    .map((r) => ({ ...r, amount: Number(r.amount) }));

  const trend = db
    .prepare(`SELECT month, COALESCE(SUM(amount),0) AS collected,
        SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END) AS paid_cnt, COUNT(*) AS total_cnt
      FROM payments GROUP BY month ORDER BY month ASC`)
    .all()
    .map((t) => ({
      month: t.month,
      collected: Number(t.collected),
      paid_cnt: Number(t.paid_cnt),
      total_cnt: Number(t.total_cnt),
    }));

  const paid = paidCnt;
  const unpaid = Math.max(0, activeMembers - paid);
  const expected = expectedActive;
  const remaining = Math.max(0, expected - collected);
  const surplus = collected > expected ? collected - expected : 0;
  const rate = expected > 0 ? Math.round((Math.min(collected, expected) * 10000) / expected) / 100 : 0;

  const top = db
    .prepare(`SELECT m.id, m.name, COALESCE(SUM(p.amount),0) AS total, COUNT(p.id) AS paid_months
      FROM members m LEFT JOIN payments p ON p.member_id=m.id AND p.paid=1
      GROUP BY m.id ORDER BY total DESC, m.name ASC LIMIT 10`)
    .all()
    .map((t) => ({ ...t, total: Number(t.total), paid_months: Number(t.paid_months) }));

  const memberStatus = db
    .prepare(`SELECT m.id, m.name, m.monthly_amount,
        (SELECT amount FROM payments p WHERE p.member_id=m.id AND p.month=?) AS amt,
        (SELECT paid FROM payments p WHERE p.member_id=m.id AND p.month=?) AS paid
      FROM members m WHERE m.active=1 ORDER BY m.id ASC`)
    .all(month, month)
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      expected: Number(r.monthly_amount),
      paid: Number(r.paid || 0) === 1,
      amount: Number(r.amt || 0),
    }));

  return ok(res, {
    month,
    year: Number(year),
    default_amount: defaultAmount,
    members: { total: totalMembers, active: activeMembers, expected: expectedActive },
    current: {
      expected, collected, spent: spentThisMonth, remaining, surplus, paid, unpaid, rate,
    },
    all_time: allTime,
    all_time_spent: totalSpent,
    available,
    loans: {
      total_borrowed: totalBorrowed,
      total_interest: totalLoanInterest,
      total_repaid: totalRepaid,
      outstanding: outstandingLoans,
      active: activeLoans,
      paid: paidLoans,
    },
    year_total: yearTotal,
    year_spent: spentThisYear,
    trend,
    top,
    member_status: memberStatus,
    recent_expenses: recentExpenses,
  });
}

export function reports(req, res) {
  const db = getDb();
  const type = String(q(req, 'type', 'all_month') || 'all_month');

  if (type === 'all_month') {
    const rows = db
      .prepare(`SELECT month, COUNT(*) AS paid_cnt, COALESCE(SUM(amount),0) AS collected
        FROM payments WHERE paid=1 GROUP BY month ORDER BY month ASC`)
      .all();
    const activeExpected = Number(scalar(db, 'SELECT COALESCE(SUM(monthly_amount),0) FROM members WHERE active=1'));
    const activeCount = Number(scalar(db, 'SELECT COUNT(*) FROM members WHERE active=1'));
    const out = rows.map((r) => {
      const expected = activeExpected;
      const collected = Number(r.collected);
      const paidCount = Number(r.paid_cnt);
      return {
        month: r.month,
        expected,
        collected,
        remaining: Math.max(0, expected - collected),
        surplus: collected > expected ? collected - expected : 0,
        paid: paidCount,
        unpaid: Math.max(0, activeCount - paidCount),
        rate: expected > 0 ? Math.round((Math.min(collected, expected) * 10000) / expected) / 100 : 0,
      };
    });
    return ok(res, { rows: out });
  }

  if (type === 'yearly') {
    const rows = db
      .prepare(`SELECT substr(month,1,4) AS year, COALESCE(SUM(amount),0) AS collected, COUNT(*) AS paid_cnt
        FROM payments WHERE paid=1 GROUP BY year ORDER BY year ASC`)
      .all();
    return ok(res, {
      rows: rows.map((r) => ({ year: r.year, collected: Number(r.collected), paid: Number(r.paid_cnt) })),
    });
  }

  if (type === 'member') {
    const rows = db
      .prepare(`SELECT m.id, m.name, m.monthly_amount,
          COALESCE((SELECT SUM(amount) FROM payments p WHERE p.member_id=m.id AND p.paid=1),0) AS total,
          (SELECT COUNT(*) FROM payments p WHERE p.member_id=m.id AND p.paid=1) AS paid
        FROM members m ORDER BY m.name ASC`)
      .all();
    return ok(res, {
      rows: rows.map((r) => {
        const paid = Number(r.paid);
        const total = Number(r.total);
        return {
          id: Number(r.id),
          name: r.name,
          total,
          paid_months: paid,
          avg: paid > 0 ? Math.round(total / paid) : 0,
          rate: 0,
        };
      }),
    });
  }

  return fail(res, 'Unknown report type');
}

export function expenses(req, res) {
  const db = getDb();
  const action = String(q(req, 'action', 'list') || 'list');

  if (req.method === 'POST' && action === 'save') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const body = req.body || {};
    const id = parseInt(body.id || 0, 10) || 0;
    const amountIn = String(body.amount ?? '');
    const reason = String(body.reason || '').trim();
    const spentAt = String(body.spent_at || today());
    const note = body.note != null ? String(body.note) : null;
    const parsed = parseMyAmount(amountIn);
    if (!reason) return fail(res, 'Reason / purpose is required');
    if (parsed === null || parsed <= 0) return fail(res, 'Valid amount required');
    const ts = now();
    if (id > 0) {
      db.prepare('UPDATE expenses SET amount=?, amount_input=?, reason=?, spent_at=?, note=?, updated_at=? WHERE id=?')
        .run(parsed, amountIn, reason, spentAt, note, ts, id);
      return ok(res, { id, updated: true });
    }
    const info = db
      .prepare('INSERT INTO expenses(amount,amount_input,reason,spent_at,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(parsed, amountIn, reason, spentAt, note, ts, ts);
    return ok(res, { id: Number(info.lastInsertRowid), created: true });
  }

  if (req.method === 'POST' && action === 'delete') {
    if (!guardAuth(req, res)) return;
    if (!guardPost(req, res)) return;
    const id = qi(req, 'id', 0);
    if (id <= 0) return fail(res, 'id required');
    db.prepare('DELETE FROM expenses WHERE id=?').run(id);
    return ok(res);
  }

  return ok(res, { items: db.prepare('SELECT * FROM expenses ORDER BY spent_at DESC, id DESC').all() });
}
