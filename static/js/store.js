/* ======================================================================
   store.js — localStorage database + domain operations
   Mirrors the server-side logic of the savings app.
   ====================================================================== */

const DB_KEY = 'suboo.db.v1';

const DEFAULT_MEMBERS = [
  'Ko chit ko', 'zaw Oo', 'Kyaw myint aye', 'toewaoo',
  'min min Aung', 'Kyaw Kyaw Htet', 'arkar', 'min khant kyaw1',
  'min khant kyaw2', 'win Myat tun', 'sai zaw zaw', 'Wai moe',
  'Hein thiha', 'bobo Aung', 'win moe Aung', 'Aung myo thant',
];

const DEFAULT_SETTINGS = {
  default_amount: '10000',
  currency: 'MMK',
  language: 'mm',
  theme: 'system',
  display_mode: 'both',
  group_name: 'Monthly Savings',
  admin_password_hash: '',
};

/* ---------------------------------------------------------------- time */
function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function isMonth(v) {
  return /^\d{4}-\d{2}$/.test(String(v || ''));
}
function isDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

/* ---------------------------------------------------------------- seed */
function freshDb() {
  const ts = now();
  const seq = { member: 1, payment: 1, expense: 1, loan: 1, loan_payment: 1, payment_history: 1 };
  const members = DEFAULT_MEMBERS.map((name) => ({
    id: seq.member++,
    name,
    active: 1,
    monthly_amount: 10000,
    note: null,
    created_at: ts,
    updated_at: ts,
  }));
  return {
    schema: 1,
    seq,
    members,
    payments: [],
    payment_history: [],
    expenses: [],
    loans: [],
    loan_payments: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/* ---------------------------------------------------------------- load */
let DB = null;

function storageAvailable() {
  try {
    const k = '__suboo_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const Store = {
  degraded: false,

  load() {
    if (DB) return DB;
    if (!storageAvailable()) {
      this.degraded = true;
      DB = freshDb();
      return DB;
    }
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch { raw = null; }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.members)) {
          DB = parsed;
          DB.settings = { ...DEFAULT_SETTINGS, ...(DB.settings || {}) };
          DB.seq = DB.seq || {};
          return DB;
        }
      } catch { /* fall through to seed */ }
    }
    DB = freshDb();
    this.save();
    return DB;
  },

  save() {
    if (this.degraded || !DB) return;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(DB));
    } catch (e) {
      throw new Error('Storage full or unavailable: ' + e.message);
    }
  },

  reset() {
    DB = freshDb();
    this.save();
    return DB;
  },

  nextId(kind) {
    if (!DB.seq[kind]) DB.seq[kind] = 1;
    return DB.seq[kind]++;
  },
};

function db() {
  return Store.load();
}

/* ================================================================ members */
function membersList({ q = '', active = '', sort = 'name', dir = 'asc' } = {}) {
  const d = db();
  const term = String(q || '').trim().toLowerCase();
  const allowed = ['id', 'name', 'monthly_amount', 'active', 'created_at'];
  const key = allowed.includes(sort) ? sort : 'name';
  const sign = String(dir).toLowerCase() === 'desc' ? -1 : 1;

  let items = d.members.filter((m) => {
    if (term && !String(m.name).toLowerCase().includes(term)) return false;
    if (active === '1' && !m.active) return false;
    if (active === '0' && m.active) return false;
    return true;
  });

  items = items.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string') return sign * av.localeCompare(bv);
    return sign * ((av || 0) - (bv || 0));
  });

  return items.map((m) => {
    const pays = d.payments.filter((p) => p.member_id === m.id && p.paid === 1);
    return {
      ...m,
      total_saved: pays.reduce((a, p) => a + p.amount, 0),
      paid_months: pays.length,
    };
  });
}

function getMember(id) {
  return db().members.find((m) => m.id === Number(id)) || null;
}

function saveMember({ id = 0, name, monthly_amount, active = 1, note = null }) {
  const d = db();
  const nm = String(name || '').trim();
  if (!nm) throw new Error('Name required');
  const amt = parseMyAmount(monthly_amount);
  if (amt == null || amt <= 0) throw new Error('Monthly amount must be > 0');
  const ts = now();
  if (id > 0) {
    const m = getMember(id);
    if (!m) throw new Error('Member not found');
    Object.assign(m, { name: nm, monthly_amount: amt, active: active ? 1 : 0, note: note || null, updated_at: ts });
  } else {
    d.members.push({
      id: Store.nextId('member'),
      name: nm,
      active: active ? 1 : 0,
      monthly_amount: amt,
      note: note || null,
      created_at: ts,
      updated_at: ts,
    });
  }
  Store.save();
}

function toggleMember(id) {
  const m = getMember(id);
  if (!m) throw new Error('Member not found');
  m.active = m.active ? 0 : 1;
  m.updated_at = now();
  Store.save();
}

function deleteMember(id) {
  const d = db();
  const nid = Number(id);
  d.members = d.members.filter((m) => m.id !== nid);
  d.payments = d.payments.filter((p) => p.member_id !== nid);
  d.loans = d.loans.filter((l) => l.member_id !== nid);
  const goneLoans = new Set(d.loans.map((l) => l.id));
  /* keep only payments of surviving loans */
  d.loan_payments = d.loan_payments.filter((p) => goneLoans.has(p.loan_id));
  Store.save();
}

/* =============================================================== payments */
function paymentsList({ month = '', member_id = 0, status = '' } = {}) {
  const d = db();
  let items = d.payments.slice();
  if (month) items = items.filter((p) => p.month === month);
  if (member_id > 0) items = items.filter((p) => p.member_id === member_id);
  if (status === 'paid') items = items.filter((p) => p.paid === 1);
  if (status === 'unpaid') items = items.filter((p) => p.paid !== 1);
  return items
    .map((p) => {
      const m = getMember(p.member_id);
      return { ...p, member_name: m ? m.name : '—', expected_amount: m ? m.monthly_amount : 0 };
    })
    .sort((a, b) => (a.month === b.month ? a.member_id - b.member_id : (a.month < b.month ? 1 : -1)));
}

function savePayment({ id = 0, member_id, month, amount, paid_at = null, note = null, unpaid = false }) {
  const d = db();
  const mid = Number(member_id);
  if (!getMember(mid)) throw new Error('member_id required');
  if (!isMonth(month)) throw new Error('month must be YYYY-MM');

  const parsed = parseMyAmount(String(amount ?? ''));
  const isPaid = !unpaid && parsed != null && parsed > 0;
  const amt = isPaid ? parsed : 0;
  const ts = now();
  const amountInput = String(amount ?? '');

  let existing = id > 0 ? d.payments.find((p) => p.id === Number(id)) : null;
  if (!existing) existing = d.payments.find((p) => p.member_id === mid && p.month === month);

  const history = (p, oldAmt, oldPaid) => d.payment_history.push({
    id: Store.nextId('payment_history'),
    payment_id: p.id,
    member_id: mid,
    month,
    old_amount: oldAmt,
    new_amount: amt,
    old_paid: oldPaid,
    new_paid: isPaid ? 1 : 0,
    changed_at: ts,
  });

  if (existing) {
    const oldAmt = existing.amount;
    const oldPaid = existing.paid;
    Object.assign(existing, {
      member_id: mid,
      month,
      amount: amt,
      amount_input: amountInput,
      paid: isPaid ? 1 : 0,
      paid_at: isPaid ? (paid_at || todayISO()) : null,
      note: note || null,
      updated_at: ts,
    });
    history(existing, oldAmt, oldPaid);
  } else {
    const p = {
      id: Store.nextId('payment'),
      member_id: mid,
      month,
      amount: amt,
      amount_input: amountInput,
      paid: isPaid ? 1 : 0,
      paid_at: isPaid ? (paid_at || todayISO()) : null,
      note: note || null,
      created_at: ts,
      updated_at: ts,
    };
    d.payments.push(p);
    history(p, null, null);
  }
  Store.save();
}

function deletePayment(id) {
  const d = db();
  d.payments = d.payments.filter((p) => p.id !== Number(id));
  d.payment_history = d.payment_history.filter((h) => h.payment_id !== Number(id));
  Store.save();
}

function bulkPay({ month, paid_at = null, amount = '', member_ids = [] }) {
  const d = db();
  if (!isMonth(month)) throw new Error('month required');
  const amountInput = String(amount ?? '').trim();
  let parsed = null;
  if (amountInput) {
    parsed = parseMyAmount(amountInput);
    if (parsed == null || parsed <= 0) throw new Error('Valid amount required');
  }
  const ts = now();
  let saved = 0;
  for (const raw of member_ids) {
    const mid = parseInt(raw, 10) || 0;
    const m = getMember(mid);
    if (!m) continue;
    const use = parsed == null ? m.monthly_amount : parsed;
    let p = d.payments.find((x) => x.member_id === mid && x.month === month);
    if (p) {
      const oldAmt = p.amount;
      const oldPaid = p.paid;
      Object.assign(p, {
        amount: use, amount_input: amountInput, paid: 1,
        paid_at: paid_at || todayISO(), updated_at: ts,
      });
      d.payment_history.push({
        id: Store.nextId('payment_history'), payment_id: p.id, member_id: mid, month,
        old_amount: oldAmt, new_amount: use, old_paid: oldPaid, new_paid: 1, changed_at: ts,
      });
    } else {
      p = {
        id: Store.nextId('payment'), member_id: mid, month, amount: use, amount_input: amountInput,
        paid: 1, paid_at: paid_at || todayISO(), note: null, created_at: ts, updated_at: ts,
      };
      d.payments.push(p);
      d.payment_history.push({
        id: Store.nextId('payment_history'), payment_id: p.id, member_id: mid, month,
        old_amount: null, new_amount: use, old_paid: null, new_paid: 1, changed_at: ts,
      });
    }
    saved++;
  }
  Store.save();
  return { saved };
}

/* =============================================================== expenses */
function expensesList() {
  return db().expenses.slice().sort((a, b) => (a.spent_at === b.spent_at ? b.id - a.id : (a.spent_at < b.spent_at ? 1 : -1)));
}

function saveExpense({ id = 0, amount, reason, spent_at = null, note = null }) {
  const d = db();
  const why = String(reason || '').trim();
  const parsed = parseMyAmount(String(amount ?? ''));
  if (!why) throw new Error('Reason / purpose is required');
  if (parsed == null || parsed <= 0) throw new Error('Valid amount required');
  const ts = now();
  if (id > 0) {
    const e = d.expenses.find((x) => x.id === Number(id));
    if (!e) throw new Error('Expense not found');
    Object.assign(e, {
      amount: parsed, amount_input: String(amount ?? ''), reason: why,
      spent_at: spent_at || todayISO(), note: note || null, updated_at: ts,
    });
  } else {
    d.expenses.push({
      id: Store.nextId('expense'),
      amount: parsed,
      amount_input: String(amount ?? ''),
      reason: why,
      spent_at: spent_at || todayISO(),
      note: note || null,
      created_at: ts,
      updated_at: ts,
    });
  }
  Store.save();
}

function deleteExpense(id) {
  const d = db();
  d.expenses = d.expenses.filter((e) => e.id !== Number(id));
  Store.save();
}

/* ================================================================== loans */
function loanRow(l) {
  const amount = Number(l.amount);
  const interest = Number(l.interest || 0);
  const repaid = db().loan_payments
    .filter((p) => p.loan_id === l.id)
    .reduce((a, p) => a + p.amount, 0);
  const total_due = amount + interest;
  const outstanding = Math.max(0, total_due - repaid);
  const m = getMember(l.member_id);
  return {
    ...l,
    amount,
    interest,
    repaid,
    total_due,
    outstanding,
    status: repaid >= total_due ? 'paid' : 'active',
    member_name: m ? m.name : '—',
  };
}

function loansList({ member_id = 0, status = '' } = {}) {
  const d = db();
  let rows = d.loans.slice().map(loanRow);
  if (member_id > 0) rows = rows.filter((l) => l.member_id === member_id);

  const summary = {
    total_borrowed: rows.reduce((a, l) => a + l.amount, 0),
    total_interest: rows.reduce((a, l) => a + l.interest, 0),
    total_repaid: rows.reduce((a, l) => a + l.repaid, 0),
    outstanding: rows.reduce((a, l) => a + l.outstanding, 0),
    active_count: rows.filter((l) => l.status === 'active').length,
    paid_count: rows.filter((l) => l.status === 'paid').length,
  };

  if (status === 'active' || status === 'paid') rows = rows.filter((l) => l.status === status);
  rows.sort((a, b) => (a.borrowed_at === b.borrowed_at ? b.id - a.id : (a.borrowed_at < b.borrowed_at ? 1 : -1)));

  const items = rows.map((l) => ({
    ...l,
    payments: d.loan_payments
      .filter((p) => p.loan_id === l.id)
      .sort((a, b) => (a.paid_at === b.paid_at ? b.id - a.id : (a.paid_at < b.paid_at ? 1 : -1))),
  }));
  return { items, summary };
}

function saveLoan({ id = 0, member_id, amount, interest = '', borrowed_at = null, due_date = '', note = null }) {
  const d = db();
  const mid = Number(member_id);
  if (mid <= 0 || !getMember(mid)) throw new Error('member_id required');
  const bAt = borrowed_at || todayISO();
  if (!isDate(bAt)) throw new Error('borrowed_at must be YYYY-MM-DD');
  const due = String(due_date || '').trim();
  if (due && !isDate(due)) throw new Error('due_date must be YYYY-MM-DD');

  const principal = parseMyAmount(String(amount ?? ''));
  if (principal == null || principal <= 0) throw new Error('Valid amount required');

  const interestInput = String(interest ?? '').trim();
  let interestVal = 0;
  if (interestInput) {
    interestVal = parseMyAmount(interestInput);
    if (interestVal == null || interestVal < 0) throw new Error('Valid interest required');
  }

  const ts = now();
  if (id > 0) {
    const l = d.loans.find((x) => x.id === Number(id));
    if (!l) throw new Error('Loan not found');
    Object.assign(l, {
      member_id: mid,
      amount: principal,
      amount_input: String(amount ?? ''),
      interest: interestVal,
      interest_input: interestInput || null,
      borrowed_at: bAt,
      due_date: due || null,
      note: note || null,
      updated_at: ts,
    });
  } else {
    d.loans.push({
      id: Store.nextId('loan'),
      member_id: mid,
      amount: principal,
      amount_input: String(amount ?? ''),
      interest: interestVal,
      interest_input: interestInput || null,
      borrowed_at: bAt,
      due_date: due || null,
      note: note || null,
      created_at: ts,
      updated_at: ts,
    });
  }
  Store.save();
}

function deleteLoan(id) {
  const d = db();
  const nid = Number(id);
  d.loans = d.loans.filter((l) => l.id !== nid);
  d.loan_payments = d.loan_payments.filter((p) => p.loan_id !== nid);
  Store.save();
}

function saveLoanPayment({ loan_id, amount, paid_at = null, note = null }) {
  const d = db();
  const lid = Number(loan_id);
  const loan = d.loans.find((l) => l.id === lid);
  if (!loan) throw new Error('Loan not found');
  const pAt = paid_at || todayISO();
  if (!isDate(pAt)) throw new Error('paid_at must be YYYY-MM-DD');
  const parsed = parseMyAmount(String(amount ?? ''));
  if (parsed == null || parsed <= 0) throw new Error('Valid amount required');

  const repaid = d.loan_payments.filter((p) => p.loan_id === lid).reduce((a, p) => a + p.amount, 0);
  const outstanding = Math.max(0, Number(loan.amount) + Number(loan.interest || 0) - repaid);
  if (parsed > outstanding) throw new Error(`Amount exceeds outstanding balance (${outstanding})`);

  d.loan_payments.push({
    id: Store.nextId('loan_payment'),
    loan_id: lid,
    amount: parsed,
    amount_input: String(amount ?? ''),
    paid_at: pAt,
    note: note || null,
    created_at: now(),
  });
  Store.save();
}

function deleteLoanPayment(id) {
  const d = db();
  d.loan_payments = d.loan_payments.filter((p) => p.id !== Number(id));
  Store.save();
}

/* ============================================================== dashboard */
function dashboard({ month = currentMonth(), year = String(new Date().getFullYear()) } = {}) {
  const d = db();
  const num = (n) => Number(n || 0);

  const activeMembers = d.members.filter((m) => m.active);
  const expectedActive = activeMembers.reduce((a, m) => a + m.monthly_amount, 0);
  const defaultAmount = parseInt(d.settings.default_amount || '10000', 10) || 10000;

  const monthPays = d.payments.filter((p) => p.month === month && p.paid === 1);
  const collected = monthPays.reduce((a, p) => a + p.amount, 0);
  const paidCnt = monthPays.length;

  const allTime = d.payments.filter((p) => p.paid === 1).reduce((a, p) => a + p.amount, 0);
  const totalSpent = d.expenses.reduce((a, e) => a + e.amount, 0);
  const totalBorrowed = d.loans.reduce((a, l) => a + num(l.amount), 0);
  const totalLoanInterest = d.loans.reduce((a, l) => a + num(l.interest), 0);
  const totalRepaid = d.loan_payments.reduce((a, p) => a + p.amount, 0);
  const available = allTime - totalSpent - totalBorrowed + totalRepaid;

  let outstandingLoans = 0;
  let activeLoans = 0;
  for (const l of d.loans) {
    const repaid = d.loan_payments.filter((p) => p.loan_id === l.id).reduce((a, p) => a + p.amount, 0);
    const out = Math.max(0, num(l.amount) + num(l.interest) - repaid);
    outstandingLoans += out;
    if (out > 0) activeLoans++;
  }

  const spentThisMonth = d.expenses.filter((e) => (e.spent_at || '').slice(0, 7) === month)
    .reduce((a, e) => a + e.amount, 0);
  const spentThisYear = d.expenses.filter((e) => (e.spent_at || '').slice(0, 4) === String(year))
    .reduce((a, e) => a + e.amount, 0);
  const yearTotal = d.payments.filter((p) => p.paid === 1 && (p.month || '').slice(0, 4) === String(year))
    .reduce((a, p) => a + p.amount, 0);

  const recentExpenses = expensesList().slice(0, 5);

  /* trend: group payments by month */
  const trendMap = new Map();
  for (const p of d.payments) {
    if (!trendMap.has(p.month)) trendMap.set(p.month, { month: p.month, collected: 0, paid_cnt: 0, total_cnt: 0 });
    const row = trendMap.get(p.month);
    row.total_cnt++;
    if (p.paid === 1) {
      row.collected += p.amount;
      row.paid_cnt++;
    }
  }
  const trend = Array.from(trendMap.values()).sort((a, b) => (a.month < b.month ? -1 : 1));

  const expected = expectedActive;
  const remaining = Math.max(0, expected - collected);
  const surplus = collected > expected ? collected - expected : 0;
  const rate = expected > 0 ? Math.round((Math.min(collected, expected) * 10000) / expected) / 100 : 0;

  const top = d.members.map((m) => {
    const pays = d.payments.filter((p) => p.member_id === m.id && p.paid === 1);
    return {
      id: m.id,
      name: m.name,
      total: pays.reduce((a, p) => a + p.amount, 0),
      paid_months: pays.length,
    };
  }).sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name)).slice(0, 10);

  const member_status = activeMembers
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((m) => {
      const p = d.payments.find((x) => x.member_id === m.id && x.month === month);
      return {
        id: m.id,
        name: m.name,
        expected: m.monthly_amount,
        paid: !!(p && p.paid === 1),
        amount: p && p.paid === 1 ? p.amount : 0,
      };
    });

  return {
    month,
    year: Number(year),
    default_amount: defaultAmount,
    members: { total: d.members.length, active: activeMembers.length, expected: expectedActive },
    current: { expected, collected, spent: spentThisMonth, remaining, surplus, paid: paidCnt, unpaid: Math.max(0, activeMembers.length - paidCnt), rate },
    all_time: allTime,
    all_time_spent: totalSpent,
    available,
    year_total: yearTotal,
    year_spent: spentThisYear,
    loans: {
      total_borrowed: totalBorrowed,
      total_interest: totalLoanInterest,
      total_repaid: totalRepaid,
      outstanding: outstandingLoans,
      active: activeLoans,
      paid: d.loans.length - activeLoans,
    },
    trend,
    top,
    member_status,
    recent_expenses: recentExpenses,
  };
}

/* ================================================================ reports */
function reports(type = 'all_month') {
  const d = db();

  if (type === 'all_month') {
    const map = new Map();
    for (const p of d.payments) {
      if (p.paid !== 1) continue;
      if (!map.has(p.month)) map.set(p.month, { month: p.month, collected: 0, paid_cnt: 0 });
      const r = map.get(p.month);
      r.collected += p.amount;
      r.paid_cnt++;
    }
    const activeExpected = d.members.filter((m) => m.active).reduce((a, m) => a + m.monthly_amount, 0);
    const activeCount = d.members.filter((m) => m.active).length;
    const rows = Array.from(map.values()).sort((a, b) => (a.month < b.month ? -1 : 1)).map((r) => ({
      month: r.month,
      expected: activeExpected,
      collected: r.collected,
      remaining: Math.max(0, activeExpected - r.collected),
      surplus: r.collected > activeExpected ? r.collected - activeExpected : 0,
      paid: r.paid_cnt,
      unpaid: Math.max(0, activeCount - r.paid_cnt),
      rate: activeExpected > 0 ? Math.round((Math.min(r.collected, activeExpected) * 10000) / activeExpected) / 100 : 0,
    }));
    return { rows };
  }

  if (type === 'yearly') {
    const map = new Map();
    for (const p of d.payments) {
      if (p.paid !== 1) continue;
      const y = (p.month || '').slice(0, 4);
      if (!map.has(y)) map.set(y, { year: y, collected: 0, paid: 0 });
      const r = map.get(y);
      r.collected += p.amount;
      r.paid++;
    }
    const rows = Array.from(map.values()).sort((a, b) => (a.year < b.year ? -1 : 1));
    return { rows };
  }

  if (type === 'member') {
    const rows = d.members.map((m) => {
      const pays = d.payments.filter((p) => p.member_id === m.id && p.paid === 1);
      const total = pays.reduce((a, p) => a + p.amount, 0);
      const paid = pays.length;
      return {
        id: m.id,
        name: m.name,
        total,
        paid_months: paid,
        avg: paid > 0 ? Math.round(total / paid) : 0,
        rate: 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { rows };
  }

  throw new Error('Unknown report type');
}

/* ========================================================= member profile */
function memberProfile(id) {
  const d = db();
  const mem = getMember(id);
  if (!mem) throw new Error('Not found');

  const pays = d.payments.filter((p) => p.member_id === mem.id);
  const byMonth = new Map(pays.map((p) => [p.month, p]));

  let earliest = pays.length ? pays.map((p) => p.month).sort()[0] : null;
  const start = earliest || currentMonth();
  const end = currentMonth();
  const months = [];
  let cursor = start;
  while (cursor.localeCompare(end) <= 0) {
    months.push(cursor);
    cursor = dateAddMonth(cursor, 1);
  }

  const expected = mem.monthly_amount;
  const rows = months.map((mo) => {
    const p = byMonth.get(mo);
    if (p && p.paid === 1) {
      return {
        month: mo, paid: 1, amount: p.amount, amount_input: p.amount_input,
        paid_at: p.paid_at, note: p.note, id: p.id, expected,
      };
    }
    return { month: mo, paid: 0, amount: 0, expected };
  });

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
  return { member: mem, months: rows, totals };
}

function dateAddMonth(yyyymm, delta) {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(5, 7), 10);
  let mm = m + delta;
  let yy = y;
  while (mm < 1) { mm += 12; yy--; }
  while (mm > 12) { mm -= 12; yy++; }
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

/* ================================================================= search */
function searchAll(term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return { members: [], payments: [] };
  const d = db();
  const members = d.members
    .filter((m) => m.name.toLowerCase().includes(q))
    .slice(0, 20)
    .map((m) => ({ id: m.id, name: m.name, monthly_amount: m.monthly_amount, active: m.active }));
  const payments = d.payments
    .filter((p) => {
      const m = getMember(p.member_id);
      const name = m ? m.name.toLowerCase() : '';
      return name.includes(q)
        || String(p.note || '').toLowerCase().includes(q)
        || String(p.amount_input || '').toLowerCase().includes(q);
    })
    .slice(0, 50)
    .map((p) => {
      const m = getMember(p.member_id);
      return { ...p, member_name: m ? m.name : '—' };
    });
  return { members, payments };
}

/* ================================================================ settings */
function getSettings() {
  return { ...db().settings };
}

function setSettings(patch) {
  db().settings = { ...db().settings, ...patch };
  Store.save();
}

/* ========================================================== import/export */
function exportPayload() {
  const d = db();
  return {
    version: 1,
    exported_at: now(),
    settings: Object.entries(d.settings).map(([key, value]) => ({ key, value })),
    members: d.members.map((m) => ({ ...m })),
    payments: d.payments.map((p) => ({ ...p })),
    expenses: d.expenses.map((e) => ({ ...e })),
    loans: d.loans.map((l) => ({ ...l })),
    loan_payments: d.loan_payments.map((p) => ({ ...p })),
  };
}

function exportCsv() {
  const d = db();
  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r\t ]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const line = (cells) => cells.map(csvCell).join(',') + '\r\n';
  let out = line(['id', 'member_id', 'member_name', 'month', 'amount', 'amount_input',
    'paid', 'paid_at', 'note', 'created_at', 'updated_at']);
  const sorted = d.payments.slice().sort((a, b) => (a.month === b.month ? a.member_id - b.member_id : (a.month < b.month ? 1 : -1)));
  for (const p of sorted) {
    const m = getMember(p.member_id);
    out += line([p.id, p.member_id, m ? m.name : '', p.month, p.amount, p.amount_input,
      p.paid, p.paid_at, p.note, p.created_at, p.updated_at]);
  }
  return out;
}

function importPayload(raw, mode = 'merge') {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON');

  const d = db();
  if (mode === 'replace') {
    d.members = [];
    d.payments = [];
    d.payment_history = [];
    d.expenses = [];
    d.loans = [];
    d.loan_payments = [];
    d.settings = { ...DEFAULT_SETTINGS };
  }

  if (Array.isArray(data.settings)) {
    for (const v of data.settings) {
      if (v && typeof v === 'object' && v.key !== undefined) d.settings[v.key] = String(v.value);
    }
  } else if (data.settings && typeof data.settings === 'object') {
    Object.assign(d.settings, data.settings);
  }

  const upsertById = (list, rows, apply) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const id = Number(r.id) || 0;
      const existing = id > 0 ? list.find((x) => x.id === id) : null;
      if (existing) Object.assign(existing, apply(r));
      else list.push(apply(r, id));
    }
  };

  const ts = now();
  upsertById(d.members, data.members, (r, id) => ({
    id: Number(r.id) || id,
    name: String(r.name || ''),
    active: r.active != null ? Number(r.active) : 1,
    monthly_amount: r.monthly_amount != null ? Number(r.monthly_amount) : 10000,
    note: r.note ?? null,
    created_at: r.created_at || ts,
    updated_at: r.updated_at || ts,
  }));

  if (Array.isArray(data.payments)) {
    for (const p of data.payments) {
      const existing = d.payments.find((x) => x.member_id === Number(p.member_id) && x.month === String(p.month || ''));
      const row = {
        id: Number(p.id) || 0,
        member_id: Number(p.member_id) || 0,
        month: String(p.month || ''),
        amount: Number(p.amount) || 0,
        amount_input: p.amount_input ?? null,
        paid: p.paid != null ? Number(p.paid) : 1,
        paid_at: p.paid_at ?? null,
        note: p.note ?? null,
        created_at: p.created_at || ts,
        updated_at: p.updated_at || ts,
      };
      if (existing) {
        const keepId = existing.id;
        Object.assign(existing, row, { id: keepId });
      } else {
        if (row.id <= 0) row.id = Store.nextId('payment');
        d.payments.push(row);
      }
    }
  }

  upsertById(d.expenses, data.expenses, (r, id) => ({
    id: Number(r.id) || id,
    amount: Number(r.amount) || 0,
    amount_input: r.amount_input ?? null,
    reason: String(r.reason || ''),
    spent_at: String(r.spent_at || ''),
    note: r.note ?? null,
    created_at: r.created_at || ts,
    updated_at: r.updated_at || ts,
  }));

  upsertById(d.loans, data.loans, (r, id) => ({
    id: Number(r.id) || id,
    member_id: Number(r.member_id) || 0,
    amount: Number(r.amount) || 0,
    amount_input: r.amount_input ?? null,
    interest: r.interest != null ? Number(r.interest) : 0,
    interest_input: r.interest_input ?? null,
    borrowed_at: String(r.borrowed_at || ''),
    due_date: r.due_date ?? null,
    note: r.note ?? null,
    created_at: r.created_at || ts,
    updated_at: r.updated_at || ts,
  }));

  upsertById(d.loan_payments, data.loan_payments, (r, id) => ({
    id: Number(r.id) || id,
    loan_id: Number(r.loan_id) || 0,
    amount: Number(r.amount) || 0,
    amount_input: r.amount_input ?? null,
    paid_at: String(r.paid_at || ''),
    note: r.note ?? null,
    created_at: r.created_at || ts,
  }));

  /* realign sequence counters past any imported ids */
  const bumpSeq = (kind, list) => {
    const max = list.reduce((a, x) => Math.max(a, Number(x.id) || 0), 0);
    if (max >= (d.seq[kind] || 1)) d.seq[kind] = max + 1;
  };
  bumpSeq('member', d.members);
  bumpSeq('payment', d.payments);
  bumpSeq('expense', d.expenses);
  bumpSeq('loan', d.loans);
  bumpSeq('loan_payment', d.loan_payments);

  Store.save();
}
