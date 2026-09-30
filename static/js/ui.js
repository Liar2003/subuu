/* ======================================================================
   ui.js — app state, helpers, toasts, confirms, modals, auth
   ====================================================================== */

/* ----------------------------------------------------------- preferences */
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('suboo.pref.' + key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('suboo.pref.' + key, String(value)); } catch { /* ignore */ }
  },
};

const HAD_PREF = {
  lang: LS.get('lang', null) !== null,
  theme: LS.get('theme', null) !== null,
  mode: LS.get('mode', null) !== null,
};

const STATE = {
  lang: LS.get('lang', 'mm'),
  theme: LS.get('theme', 'system'),
  mode: LS.get('mode', 'both'),
  month: LS.get('month', new Date().toISOString().slice(0, 7)),
  year: parseInt(LS.get('year', String(new Date().getFullYear())), 10),
  auth: false,
  loginOpen: false,
  settings: {},
  pageTitle: '',
  drawerOpen: false,
  route: '/dashboard',
};

/* ---------------------------------------------------------------- basics */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function setPref(key, value) {
  STATE[key] = value;
  LS.set(key, value);
  if (key === 'lang') {
    document.documentElement.setAttribute('lang', value);
    renderShellText();
  }
  if (key === 'theme') applyTheme();
  if (key === 'mode') renderShellText();
}

function applyTheme() {
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const resolved = STATE.theme === 'system'
    ? (mq && mq.matches ? 'dark' : 'light')
    : STATE.theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

function applyDocumentTitle() {
  const group = (STATE.settings && STATE.settings.group_name) || 'Monthly Savings';
  document.title = STATE.pageTitle ? `${STATE.pageTitle} — ${group}` : `${group} — Monthly Savings`;
}

/* ----------------------------------------------------------------- dates */
function yyyymm(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function parseYyyymm(s) {
  const [y, m] = String(s).split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function addMonth(s, delta) {
  const d = parseYyyymm(s);
  d.setMonth(d.getMonth() + delta);
  return yyyymm(d);
}
function monthName(s, lang) {
  const d = parseYyyymm(s);
  const en = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const mm = ['ဇန်နဝါရီ', 'ဖေဖော်ဝါရီ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူလိုင်', 'သြဂုတ်',
    'စက်တင်ဘာ', 'အောက်တိုဘာ', 'နိုဝင်ဘာ', 'ဒီဇင်ဘာ'];
  return (lang === 'mm' ? mm : en)[d.getMonth()] + ' ' + d.getFullYear();
}
function shortMonthName(s, lang) {
  const d = parseYyyymm(s);
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mm = ['ဇန်', 'ဖေ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူ', 'သြ', 'စက်', 'အောက်', 'နို', 'ဒီ'];
  return (lang === 'mm' ? mm : en)[d.getMonth()];
}
function monthOptions(countBack = 24, countForward = 6) {
  const now = new Date();
  const out = [];
  for (let i = -countBack; i <= countForward; i++) out.push(yyyymm(new Date(now.getFullYear(), now.getMonth() + i, 1)));
  return out;
}
function yearOptions() {
  const yr = new Date().getFullYear();
  const out = [];
  for (let y = yr - 5; y <= yr + 1; y++) out.push(y);
  return out;
}

/* ---------------------------------------------------------------- toasts */
function toast(message, kind = 'good', ms = 2600) {
  const root = qs('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ---------------------------------------------------------------- confirm */
function confirmAsk(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const host = qs('#overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-root open';
    wrap.innerHTML = `
      <div class="modal-card">
        <header class="modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="icon-btn" data-close>✕</button>
        </header>
        <div class="modal-body"><p>${esc(message)}</p></div>
        <footer class="modal-foot">
          <button type="button" class="ghost-btn" data-no>${esc(t('action.cancel'))}</button>
          <button type="button" class="primary-btn" data-yes>${esc(t('action.confirm'))}</button>
        </footer>
      </div>`;
    const done = (val) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) done(false); });
    qs('[data-close]', wrap).onclick = () => done(false);
    qs('[data-no]', wrap).onclick = () => done(false);
    qs('[data-yes]', wrap).onclick = () => done(true);
    host.appendChild(wrap);
    qs('[data-yes]', wrap).focus();
  });
}

/* ----------------------------------------------------------------- modals */
let modalStack = [];

function openModal({ title, body, footer = '', onMount = null, wide = false }) {
  const host = qs('#overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-root open';
  wrap.innerHTML = `
    <div class="modal-card${wide ? ' wide' : ''}">
      <header class="modal-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="icon-btn" data-close>✕</button>
      </header>
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">${footer}</footer>
    </div>`;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    modalStack = modalStack.filter((m) => m !== entry);
    wrap.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  qs('[data-close]', wrap).onclick = close;
  const entry = { wrap, close };
  modalStack.push(entry);
  host.appendChild(wrap);

  const first = qs('input:not([type=hidden]), select, textarea, button.primary-btn', qs('.modal-body', wrap));
  if (first) setTimeout(() => first.focus(), 30);
  if (typeof onMount === 'function') onMount(wrap, close);
  return { wrap, close };
}

function closeAllModals() {
  modalStack.slice().forEach((m) => m.close());
}

/* ------------------------------------------------------------------ auth */
const SESSION_KEY = 'suboo.session';
const SESSION_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PASSWORD = 'admin123';

function fnvHash(text) {
  let h = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv:' + h.toString(16).padStart(8, '0');
}

async function sha256Hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return 'sha256:' + hex;
}

async function hashPassword(pw) {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try { return await sha256Hash(pw); } catch { /* fall through */ }
  }
  return fnvHash(pw);
}

async function verifyPassword(pw, stored) {
  if (!stored) return false;
  try {
    if (stored.startsWith('sha256:')) {
      if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.subtle.digest) return false;
      return (await sha256Hash(pw)) === stored;
    }
    if (stored.startsWith('fnv:')) return fnvHash(pw) === stored;
  } catch { return false; }
  return false;
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const exp = Number(raw) || 0;
    if (Date.now() > exp) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return exp;
  } catch {
    return null;
  }
}

function isAuthed() {
  if (STATE.auth) return true;
  return !!readSession();
}

function writeSession() {
  try { sessionStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_MS)); } catch { /* ignore */ }
}

async function doLogin(password) {
  const s = getSettings();
  if (!s.admin_password_hash) {
    /* first sign-in: only the documented default is accepted, then stored */
    if (String(password || '') !== DEFAULT_PASSWORD) return false;
    setSettings({ admin_password_hash: await hashPassword(password) });
    STATE.auth = true;
    writeSession();
    return true;
  }
  const ok = await verifyPassword(password, s.admin_password_hash);
  if (!ok) return false;
  STATE.auth = true;
  writeSession();
  return true;
}

function doLogout() {
  STATE.auth = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  STATE.loginOpen = true;
  renderLogin();
  refresh();
}

function enterAsGuest() {
  STATE.auth = false;
  STATE.loginOpen = false;
  renderLogin();
  refresh();
  if (!window.location.hash) window.location.hash = '#/dashboard';
}

function ensureAuth() {
  if (isAuthed()) { STATE.auth = true; return true; }
  STATE.loginOpen = true;
  renderLogin();
  return false;
}

/* Require auth before mutating actions; returns boolean. */
function guard() {
  return ensureAuth();
}

/* ---------------------------------------------------------- lock screen */
function renderLogin() {
  const host = qs('#login-root');
  if (!host) return;
  document.body.classList.toggle('locked', STATE.loginOpen);
  if (!STATE.loginOpen) { host.innerHTML = ''; return; }
  const s = STATE.settings || {};
  host.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark" style="width:56px;height:56px;font-size:26px">က</div>
          <div>
            <div class="login-title">${esc(s.group_name || 'Monthly Savings')}</div>
            <div class="login-sub">${esc(t('login.subtitle'))}</div>
          </div>
        </div>
        <form autocomplete="off">
          <label class="field">
            <span>${esc(t('login.password'))}</span>
            <input type="password" name="password" autocomplete="new-password" />
          </label>
          <div class="login-error" hidden></div>
          <button class="primary-btn" type="submit">${esc(t('login.submit'))}</button>
        </form>
        <button class="ghost-btn login-guest" type="button" data-guest>${esc(t('login.guest'))}</button>
        <div class="login-hint muted">${esc(t('login.hint'))}</div>
      </div>
    </div>`;
  const form = qs('form', host);
  const err = qs('.login-error', host);
  const input = qs('input[name=password]', host);
  setTimeout(() => input && input.focus(), 30);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const ok = await doLogin(input.value);
    if (ok) {
      toast(t('login.submit'), 'good', 1200);
      STATE.loginOpen = false;
      renderLogin();
      refresh();
    } else {
      err.textContent = t('login.invalid');
      err.hidden = false;
      input.select();
    }
  });
  qs('[data-guest]', host).onclick = () => { enterAsGuest(); refresh(); };
}

/* --------------------------------------------------------------- refresh */
let refreshHandler = null;
function onRefresh(fn) { refreshHandler = fn; }
function refresh() {
  if (typeof refreshHandler === 'function') refreshHandler();
}

function setPageTitle(title) {
  STATE.pageTitle = title;
  applyDocumentTitle();
  const el = qs('#page-title');
  if (el) el.textContent = title;
}

/* --------------------------------------------------------------- helpers */
/* Amount display: mirrors the React <Amount /> component */
function amtHtml(n, title) {
  const a = formatAmount(n, STATE.mode);
  const tt = title ? ` title="${esc(title)}"` : '';
  if (!a) return `<span${tt}>—</span>`;
  const lang = STATE.lang;
  if (STATE.mode === 'exact') return `<span class="amt-exact"${tt}>${esc(lang === 'mm' ? a.mm : a.en)}</span>`;
  if (STATE.mode === 'units') return `<span class="amt-units amount-text"${tt}>${esc(a.mm)}</span>`;
  return `<span class="amt-stack"${tt}><span class="amt-exact">${esc(lang === 'mm' ? a.mm : a.en)}</span><span class="amt-units amount-text">${esc(a.mm)}</span></span>`;
}

function amtText(n) {
  const a = formatAmount(n, STATE.mode);
  if (!a) return '—';
  return STATE.lang === 'mm' ? a.mm : a.en;
}

function amtTextEn(n) {
  const a = formatAmount(n, STATE.mode);
  if (!a) return '—';
  return a.en || a.mm;
}

/* Live preview under amount inputs (mirrors <AmountPreview />) */
function previewHtml(value) {
  const v = String(value || '').trim();
  if (!v) return `<div class="amount-preview"></div>`;
  const n = parseMyAmount(v);
  if (n == null) return `<div class="amount-preview err">${esc(t('amount.invalid'))}</div>`;
  const a = formatAmount(n, STATE.mode);
  return `<div class="amount-preview ok">${esc(STATE.lang === 'mm' ? a.mm : a.en)}</div>`;
}

function bindPreview(input, slot) {
  const update = () => { slot.innerHTML = previewHtml(input.value); };
  input.addEventListener('input', update);
  update();
}

function monthLabel(m) { return monthName(m, STATE.lang); }
function shortMonthLabel(m) { return shortMonthName(m, STATE.lang); }
