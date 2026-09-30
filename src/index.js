import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';
import * as system from './api/system.js';
import * as membersApi from './api/members.js';
import * as paymentsApi from './api/payments.js';
import * as dataApi from './api/data.js';
import * as loansApi from './api/loans.js';
import * as backupApi from './api/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const CLIENT_DIST = path.resolve(__dirname, '../dist');

const handlers = {
  settings: system.settings,
  login: system.login,
  logout: system.logout,
  auth_status: system.authStatus,
  change_password: system.changePassword,
  parse: system.parse,
  members: membersApi.members,
  member: membersApi.member,
  search: membersApi.search,
  payments: paymentsApi.payments,
  save_payment: paymentsApi.savePayment,
  delete_payment: paymentsApi.deletePayment,
  bulk_pay: paymentsApi.bulkPay,
  dashboard: dataApi.dashboard,
  reports: dataApi.reports,
  expenses: dataApi.expenses,
  loans: loansApi.loans,
  save_loan_payment: loansApi.saveLoanPayment,
  delete_loan_payment: loansApi.deleteLoanPayment,
  export: backupApi.exportData,
  import: backupApi.importData,
};

const app = express();
app.disable('x-powered-by');

app.use(session({
  name: 'SUBOOSESSID',
  secret: process.env.SESSION_SECRET || 'suboo-savings-session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 2 * 60 * 60 * 1000,
  },
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.all('/api/:action', (req, res) => {
  const action = String(req.params.action).replace(/[^a-z0-9_]/gi, '');
  const handler = handlers[action];
  if (!handler) {
    return res.status(404).json({ success: false, error: 'Unknown API endpoint' });
  }
  try {
    return handler(req, res);
  } catch (e) {
    console.error('[savings] API error:', e);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Server error' });
    }
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Unknown API endpoint' });
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// Warm the database so the file/schema exist before the first request.
getDb();

app.listen(PORT, () => {
  console.log(`[savings] server listening on http://localhost:${PORT}`);
});
