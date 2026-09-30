/* ======================================================================
   app.js — shell, router, search, boot
   ====================================================================== */

const NAV_ITEMS = [
  { route: '/dashboard', key: 'dashboard', icon: '▦', label: 'nav.dashboard' },
  { route: '/monthly', key: 'monthly', icon: '▤', label: 'nav.monthly' },
  { route: '/members', key: 'members', icon: '◉', label: 'nav.members' },
  { route: '/loans', key: 'loans', icon: '↗', label: 'nav.loans' },
  { route: '/expenses', key: 'expenses', icon: '↘', label: 'nav.expenses' },
  { route: '/reports', key: 'reports', icon: '▣', label: 'nav.reports' },
  { route: '/calendar', key: 'calendar', icon: '▦', label: 'nav.calendar' },
  { route: '/backup', key: 'backup', icon: '◈', label: 'nav.backup' },
  { route: '/settings', key: 'settings', icon: '⚙', label: 'nav.settings' },
];

const BOTTOM_ITEMS = [
  { route: '/dashboard', key: 'dashboard', icon: '▦', label: 'nav.dashboard' },
  { route: '/monthly', key: 'monthly', icon: '▤', label: 'nav.monthly' },
  { route: '/expenses', key: 'expenses', icon: '↘', label: 'nav.expenses' },
  { route: '/settings', key: 'settings', icon: '⚙', label: 'nav.settings' },
];

function activeKeyFor(route) {
  if (route.startsWith('/members/') || route.startsWith('/member/')) return 'members';
  return route.replace(/^\//, '').split('/')[0] || 'dashboard';
}

/* ----------------------------------------------------------------- shell */
function setDrawer(open) {
  STATE.drawerOpen = open;
  const sidebar = qs('#sidebar');
  const backdrop = qs('#backdrop');
  if (sidebar) sidebar.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('show', open);
}

function syncAuthUi() {
  document.body.classList.toggle('is-auth', STATE.auth);
  const authBtn = qs('#auth-btn');
  if (authBtn) {
    authBtn.textContent = STATE.auth ? t('admin.logout') : t('login.submit');
    authBtn.className = STATE.auth ? 'ghost-btn' : 'primary-btn';
  }
  const quick = qs('#quick-pay');
  if (quick) { quick.disabled = !STATE.auth; quick.textContent = t('action.quick_pay'); }
}

function renderShell() {
  qs('#nav').innerHTML = NAV_ITEMS.map((item) => `
    <a class="nav-item" href="#${item.route}" data-route="${item.key}">
      <span class="nav-ico">${item.icon}</span>
      <span>${esc(t(item.label))}</span>
    </a>`).join('');

  qs('#bottom-nav').innerHTML = BOTTOM_ITEMS.map((item) => `
    <a href="#${item.route}" data-route="${item.key}">
      ${item.icon}
      <span>${esc(t(item.label))}</span>
    </a>`).join('');

  qs('#month-picker').innerHTML = monthOptions()
    .map((m) => `<option value="${m}">${esc(monthName(m, STATE.lang))}</option>`).join('');
  qs('#year-picker').innerHTML = yearOptions()
    .map((y) => `<option value="${y}">${y}</option>`).join('');

  qs('#global-search').placeholder = 'Search…';
  syncAuthUi();
  renderShellText();
  syncPickers();
}

function renderShellText() {
  const bt = qs('#brand-title');
  if (bt) bt.textContent = t('app.title');
  const bs = qs('#brand-sub');
  if (bs) bs.textContent = t('app.subtitle');
  const nav = qs('#nav');
  if (nav) {
    NAV_ITEMS.forEach((item) => {
      const el = nav.querySelector(`[data-route="${item.key}"] span:last-child`);
      if (el) el.textContent = t(item.label);
    });
  }
  const bottom = qs('#bottom-nav');
  if (bottom) {
    BOTTOM_ITEMS.forEach((item) => {
      const el = bottom.querySelector(`[data-route="${item.key}"] span`);
      if (el) el.textContent = t(item.label);
    });
  }
  const mp = qs('#month-picker');
  if (mp) {
    const keep = mp.value;
    mp.innerHTML = monthOptions().map((m) => `<option value="${m}">${esc(monthName(m, STATE.lang))}</option>`).join('');
    mp.value = keep && [...mp.options].some((o) => o.value === keep) ? keep : STATE.month;
  }
  const lock = qs('#locked-slot');
  if (lock) lock.innerHTML = lockedBannerHtml();
  syncAuthUi();
  const title = qs('#page-title');
  if (title) title.textContent = STATE.pageTitle;
}

function syncPickers() {
  const mp = qs('#month-picker');
  const yp = qs('#year-picker');
  if (mp && [...mp.options].some((o) => o.value === STATE.month)) mp.value = STATE.month;
  if (yp) yp.value = String(STATE.year);
}

function lockedBannerHtml() {
  if (STATE.auth) return '';
  return `<div class="locked-banner">
    <span>🔒 ${esc(t('login.locked_banner'))}</span>
    <button class="ghost-btn" type="button" id="banner-login">${esc(t('login.submit'))}</button>
  </div>`;
}

/* ---------------------------------------------------------------- search */
function renderSearchResults(results) {
  const box = qs('#search-results');
  if (!results) { box.hidden = true; box.innerHTML = ''; return; }
  const { members, payments } = results;
  if (!members.length && !payments.length) { box.hidden = true; box.innerHTML = ''; return; }

  let html = '';
  if (members.length) {
    html += `<div class="sr-section">${esc(t('nav.members'))}</div>`;
    html += members.map((m) => `
      <div class="sr-item" data-member="${m.id}" role="button" tabindex="0">
        <span>${esc(m.name)}</span>
        <span class="muted">${amtHtml(m.monthly_amount)}</span>
      </div>`).join('');
  }
  if (payments.length) {
    html += `<div class="sr-section">Payments</div>`;
    html += payments.map((p) => `
      <div class="sr-item" data-member="${p.member_id}" role="button" tabindex="0">
        <span>${esc(p.member_name)} • ${esc(p.month)}</span>
        <span class="muted">${Number(p.paid) === 1 ? amtHtml(p.amount) : esc(t('status.unpaid'))}</span>
      </div>`).join('');
  }
  box.innerHTML = html;
  box.hidden = false;
  qsa('[data-member]', box).forEach((el) => el.onclick = () => {
    location.hash = '#/members/' + el.getAttribute('data-member');
    renderSearchResults(null);
    qs('#global-search').value = '';
  });
}

/* ---------------------------------------------------------------- router */
function parseRoute() {
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path) return { key: 'dashboard', id: 0 };
  const parts = path.split('/');
  const key = parts[0] || 'dashboard';
  if (key === 'members' || key === 'member') {
    const id = parseInt(parts[1], 10) || 0;
    return { key: 'members', id };
  }
  return { key, id: 0 };
}

function renderRoute() {
  const { key, id } = parseRoute();
  STATE.route = '/' + (key === 'members' && id ? 'members/' + id : key);

  document.body.classList.toggle('is-auth', STATE.auth);
  qs('#locked-slot').innerHTML = lockedBannerHtml();
  const bannerLogin = qs('#banner-login');
  if (bannerLogin) bannerLogin.onclick = () => { STATE.loginOpen = true; renderLogin(); };

  qsa('[data-route]').forEach((el) => el.classList.toggle('active', el.getAttribute('data-route') === activeKeyFor(STATE.route)));

  syncPickers();
  syncAuthUi();

  const root = qs('#view');
  root.classList.remove('fade-in');
  void root.offsetWidth;
  root.classList.add('fade-in');

  try {
    if (key === 'members' && id) viewMember(root, id);
    else if (key === 'members') viewMembers(root);
    else if (key === 'dashboard' || key === '') viewDashboard(root);
    else if (key === 'monthly') viewMonthly(root);
    else if (key === 'loans') viewLoans(root);
    else if (key === 'expenses') viewExpenses(root);
    else if (key === 'reports') viewReports(root);
    else if (key === 'calendar') viewCalendar(root);
    else if (key === 'backup') viewBackup(root);
    else if (key === 'settings') viewSettings(root);
    else viewNotFound(root);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty">${esc(err && err.message ? err.message : 'Error')}<br/>
      <button class="ghost-btn" style="margin-top:10px" type="button" onclick="location.reload()">${esc(t('common.refresh'))}</button>
    </div>`;
  }
}

/* ------------------------------------------------------------------ boot */
function bindShellEvents() {
  qs('#menu-btn').onclick = () => setDrawer(!STATE.drawerOpen);
  qs('#backdrop').onclick = () => setDrawer(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
  if (window.matchMedia) {
    const mq = window.matchMedia('(max-width: 900px)');
    if (mq.addEventListener) mq.addEventListener('change', (e) => { if (!e.matches) setDrawer(false); });
    else if (mq.addListener) mq.addListener((e) => { if (!e.matches) setDrawer(false); });
  }

  qsa('#nav a, #bottom-nav a').forEach((a) => a.addEventListener('click', () => setDrawer(false)));

  qs('#month-picker').addEventListener('change', (e) => {
    setPref('month', e.target.value);
    VSTATE.monthlySel = new Set();
    refresh();
  });
  qs('#year-picker').addEventListener('change', (e) => {
    setPref('year', parseInt(e.target.value, 10));
    refresh();
  });

  qs('#quick-pay').onclick = () => {
    if (!guard()) return;
    openPaymentModal({ month: STATE.month });
  };

  qs('#auth-btn').onclick = () => {
    if (STATE.auth) doLogout();
    else { STATE.loginOpen = true; renderLogin(); }
  };

  qs('#sidebar-lang').onclick = () => {
    setPref('lang', STATE.lang === 'mm' ? 'en' : 'mm');
    setSettings({ language: STATE.lang });
    refresh();
  };
  qs('#sidebar-theme').onclick = () => {
    const order = ['light', 'dark', 'system'];
    setPref('theme', order[(order.indexOf(STATE.theme) + 1) % order.length]);
    setSettings({ theme: STATE.theme });
    refresh();
  };

  /* global search */
  const input = qs('#global-search');
  const runSearch = debounce(() => {
    const q = input.value.trim();
    if (!q) { renderSearchResults(null); return; }
    renderSearchResults(searchAll(q));
  }, 180);
  input.addEventListener('input', runSearch);
  document.addEventListener('click', (e) => {
    const wrap = qs('#search-wrap');
    if (wrap && !wrap.contains(e.target)) renderSearchResults(null);
  });

  window.addEventListener('hashchange', renderRoute);
  onRefresh(renderRoute);
}

function boot() {
  Store.load();
  STATE.settings = getSettings();

  if (!HAD_PREF.lang && STATE.settings.language) { STATE.lang = STATE.settings.language; LS.set('lang', STATE.lang); }
  if (!HAD_PREF.theme && STATE.settings.theme) { STATE.theme = STATE.settings.theme; LS.set('theme', STATE.theme); }
  if (!HAD_PREF.mode && STATE.settings.display_mode) { STATE.mode = STATE.settings.display_mode; LS.set('mode', STATE.mode); }

  document.documentElement.setAttribute('lang', STATE.lang);
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', () => { if (STATE.theme === 'system') applyTheme(); });
  }

  if (Store.degraded) {
    setTimeout(() => toast('localStorage unavailable — changes will not persist', 'warn', 6000), 400);
  }

  STATE.auth = isAuthed();
  STATE.loginOpen = !STATE.auth;
  applyDocumentTitle();

  renderShell();
  bindShellEvents();

  if (!location.hash) location.replace('#/dashboard');
  renderRoute();
  renderLogin();
}

document.addEventListener('DOMContentLoaded', boot);
