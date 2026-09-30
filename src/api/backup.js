import fs from 'node:fs';
import path from 'node:path';
import { getDb, BACKUP_DIR } from '../db.js';
import { ok, fail, q } from '../lib/http.js';
import { now } from '../lib/util.js';
import { guardAuth, guardPost } from '../middleware/auth.js';

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r\t ]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvLine(cells) {
  return cells.map(csvCell).join(',') + '\r\n';
}

export function exportData(req, res) {
  if (!guardAuth(req, res)) return;
  const db = getDb();
  const fmt = String(q(req, 'format', 'json') || 'json');
  const stamp = new Date().toISOString().slice(0, 10);

  if (fmt === 'csv') {
    const rows = db.prepare(`SELECT p.id,p.member_id,m.name AS member_name,p.month,p.amount,p.amount_input,
        p.paid,p.paid_at,p.note,p.created_at,p.updated_at
      FROM payments p JOIN members m ON m.id=p.member_id ORDER BY p.month DESC, m.id`).all();
    let out = csvLine(['id', 'member_id', 'member_name', 'month', 'amount', 'amount_input',
      'paid', 'paid_at', 'note', 'created_at', 'updated_at']);
    for (const r of rows) out += csvLine(Object.values(r));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payments-${stamp}.csv`);
    return res.send(out);
  }

  if (fmt === 'sqlite') {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, `savings-backup-${stamp}.sqlite`);
    if (fs.existsSync(dest)) fs.rmSync(dest);
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${path.basename(dest)}`);
    return res.sendFile(dest, (err) => {
      if (err && !res.headersSent) fail(res, 'Backup failed', 500);
    });
  }

  const payload = {
    version: 1,
    exported_at: now(),
    settings: db.prepare('SELECT * FROM settings').all(),
    members: db.prepare('SELECT * FROM members').all(),
    payments: db.prepare('SELECT * FROM payments').all(),
    expenses: db.prepare('SELECT * FROM expenses').all(),
    loans: db.prepare('SELECT * FROM loans').all(),
    loan_payments: db.prepare('SELECT * FROM loan_payments').all(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=savings-backup-${stamp}.json`);
  return res.send(JSON.stringify(payload, null, 2));
}

export function importData(req, res) {
  if (!guardAuth(req, res)) return;
  if (!guardPost(req, res)) return;
  const body = req.body || {};
  const json = typeof body.data === 'string' ? body.data : '';
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') return fail(res, 'Invalid JSON');

  const mode = String(q(req, 'mode', 'merge') || 'merge');
  const db = getDb();

  const tx = db.transaction(() => {
    if (mode === 'replace') {
      db.exec('DELETE FROM loan_payments; DELETE FROM loans; DELETE FROM payments; DELETE FROM members; DELETE FROM settings; DELETE FROM expenses;');
    }
    if (Array.isArray(data.settings)) {
      const up = db.prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      );
      for (let v of data.settings) {
        let k;
        if (v && typeof v === 'object' && v.key !== undefined) { k = v.key; v = v.value; }
        else continue;
        up.run(String(k), String(v));
      }
    }
    if (Array.isArray(data.members)) {
      const ins = db.prepare(`INSERT INTO members(id,name,active,monthly_amount,note,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, active=excluded.active,
        monthly_amount=excluded.monthly_amount, note=excluded.note, updated_at=excluded.updated_at`);
      for (const m of data.members) {
        ins.run(
          Number(m.id) || 0,
          String(m.name || ''),
          m.active != null ? Number(m.active) : 1,
          m.monthly_amount != null ? Number(m.monthly_amount) : 10000,
          m.note ?? null,
          m.created_at || now(),
          m.updated_at || now()
        );
      }
    }
    if (Array.isArray(data.payments)) {
      const ins = db.prepare(`INSERT INTO payments(id,member_id,month,amount,amount_input,paid,paid_at,note,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(member_id,month) DO UPDATE SET amount=excluded.amount, amount_input=excluded.amount_input,
        paid=excluded.paid, paid_at=excluded.paid_at, note=excluded.note, updated_at=excluded.updated_at`);
      for (const p of data.payments) {
        ins.run(
          Number(p.id) || 0,
          Number(p.member_id) || 0,
          String(p.month || ''),
          Number(p.amount) || 0,
          p.amount_input ?? null,
          p.paid != null ? Number(p.paid) : 1,
          p.paid_at ?? null,
          p.note ?? null,
          p.created_at || now(),
          p.updated_at || now()
        );
      }
    }
    if (Array.isArray(data.expenses)) {
      const ins = db.prepare(`INSERT INTO expenses(id,amount,amount_input,reason,spent_at,note,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET amount=excluded.amount, amount_input=excluded.amount_input,
        reason=excluded.reason, spent_at=excluded.spent_at, note=excluded.note, updated_at=excluded.updated_at`);
      for (const e of data.expenses) {
        ins.run(
          Number(e.id) || 0,
          Number(e.amount) || 0,
          e.amount_input ?? null,
          String(e.reason || ''),
          String(e.spent_at || ''),
          e.note ?? null,
          e.created_at || now(),
          e.updated_at || now()
        );
      }
    }
    if (Array.isArray(data.loans)) {
      const ins = db.prepare(`INSERT INTO loans(id,member_id,amount,amount_input,interest,interest_input,borrowed_at,due_date,note,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id, amount=excluded.amount,
        amount_input=excluded.amount_input, interest=excluded.interest, interest_input=excluded.interest_input,
        borrowed_at=excluded.borrowed_at, due_date=excluded.due_date, note=excluded.note, updated_at=excluded.updated_at`);
      for (const l of data.loans) {
        ins.run(
          Number(l.id) || 0,
          Number(l.member_id) || 0,
          Number(l.amount) || 0,
          l.amount_input ?? null,
          l.interest != null ? Number(l.interest) : 0,
          l.interest_input ?? null,
          String(l.borrowed_at || ''),
          l.due_date ?? null,
          l.note ?? null,
          l.created_at || now(),
          l.updated_at || now()
        );
      }
    }
    if (Array.isArray(data.loan_payments)) {
      const ins = db.prepare(`INSERT INTO loan_payments(id,loan_id,amount,amount_input,paid_at,note,created_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET loan_id=excluded.loan_id, amount=excluded.amount,
        amount_input=excluded.amount_input, paid_at=excluded.paid_at, note=excluded.note`);
      for (const p of data.loan_payments) {
        ins.run(
          Number(p.id) || 0,
          Number(p.loan_id) || 0,
          Number(p.amount) || 0,
          p.amount_input ?? null,
          String(p.paid_at || ''),
          p.note ?? null,
          p.created_at || now()
        );
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return fail(res, 'Import failed: ' + e.message, 500);
  }
  return ok(res);
}
