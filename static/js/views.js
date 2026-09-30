/* ======================================================================
   views.js — page renderers (dashboard, monthly, members, loans, ...)
   ====================================================================== */

const VSTATE = {
  range: 'all',
  memberQuery: '',
  memberFilter: '',
  reportTab: 'all_month',
  loanFilter: 'all',
  monthlySel: new Set(),
};

function adm() { return STATE.auth ? '' : ' disabled'; }
function badge(kind, label) { return `<span class="badge ${kind}">${esc(label)}</span>`; }
function pct(part, whole) {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.round((part * 10000) / whole) / 100);
}

function avgPerMonth(d) {
  if (!d || !d.recent_expenses || !d.recent_expenses.length) return 0;
  const months = new Set();
  for (const e of d.recent_expenses) if (e.spent_at) months.add(e.spent_at.slice(0, 7));
  if (!months.size) return 0;
  return Math.round((d.all_time_spent || 0) / months.size);
}

function spendCard(icon, label, value, ratio, fillClass, progressText) {
  const a = formatAmount(value, STATE.mode);
  return `<div class="kpi kpi-grad-spend">
    <div class="kpi-head"><div class="kpi-ico">${icon}</div><div class="kpi-label">${esc(label)}</div></div>
    <div class="kpi-value">${esc(a ? a.en : '—')}</div>
    <div class="kpi-sub amount-text">${esc(a ? a.mm : '')}</div>
    <div class="kpi-progress">
      <div class="kpi-progress-fill ${fillClass}" style="width:${ratio}%"></div>
      <span class="kpi-progress-label">${esc(progressText)}</span>
    </div>
  </div>`;
}

/* ================================================================ dashboard */
function viewDashboard(root) {
  setPageTitle(t('dashboard.title'));
  const d = dashboard({ month: STATE.month, year: STATE.year });
  const cm = d.current;
  const ms = d.members;
  const spent = d.all_time_spent || 0;
  const avail = d.available || 0;
  const LA = d.loans;
  const a = (n) => formatAmount(n, STATE.mode);
  const spendRatio = d.all_time > 0 ? pct(spent, d.all_time) : 0;

  const trendRows = VSTATE.range === 'all' ? d.trend : d.trend.slice(-parseInt(VSTATE.range, 10));
  const lineData = trendRows.map((r) => ({
    x: r.month,
    y: r.collected,
    label: monthName(r.month, STATE.lang),
    shortLabel: shortMonthName(r.month, STATE.lang),
    extra: { paid: r.paid_cnt, total: r.total_cnt },
  }));

  const rangeTabs = ['1', '3', '6', '12', 'all'].map((r) =>
    `<button type="button" class="${VSTATE.range === r ? 'active' : ''}" data-range="${r}">${r === 'all' ? esc(t('common.all')) : r + 'M'}</button>`).join('');

  const expenseList = d.recent_expenses.length
    ? d.recent_expenses.map((e) => `
      <div class="list-item">
        <div class="rank">↘</div>
        <div><div class="name">${esc(e.reason || '—')}</div><div class="meta">${esc((e.spent_at || '').slice(0, 10))}</div></div>
        <div class="amt">${amtHtml(e.amount)}</div>
      </div>`).join('')
    : `<div class="empty" style="margin:0">${esc(t('spend.empty'))}</div>`;

  const topList = d.top.slice(0, 3).map((m, i) => `
    <div class="list-item">
      <div class="rank">${i + 1}</div>
      <div><div class="name">${esc(m.name)}</div><div class="meta">${m.paid_months} ${esc(STATE.lang === 'mm' ? 'လ' : 'months')}</div></div>
      <div class="amt">${amtHtml(m.total)}</div>
    </div>`).join('');

  const totalsRows = d.trend.slice().reverse().map((r) => {
    const exp = ms.expected;
    const rem = Math.max(0, exp - r.collected);
    const rate = exp ? Math.round((Math.min(r.collected, exp) * 10000) / exp) / 100 : 0;
    return `<tr>
      <td data-label="${esc(t('reports.col.month'))}">${esc(monthName(r.month, STATE.lang))}</td>
      <td class="num" data-label="${esc(t('reports.col.collected'))}">${amtHtml(r.collected)}</td>
      <td class="num" data-label="${esc(t('reports.col.expected'))}">${amtHtml(exp)}</td>
      <td class="num" data-label="${esc(t('reports.col.remaining'))}">${amtHtml(rem)}</td>
      <td class="center" data-label="${esc(t('reports.col.rate'))}">${rate}%</td>
    </tr>`;
  }).join('');

  const statusRows = d.member_status.map((m) => `
    <tr>
      <td data-label="${esc(t('monthly.table.member'))}">${esc(m.name)}</td>
      <td class="num" data-label="${esc(t('monthly.table.target'))}">${amtHtml(m.expected)}</td>
      <td class="num" data-label="${esc(t('monthly.table.amount'))}">${amtHtml(m.amount)}</td>
      <td class="center" data-label="${esc(t('monthly.table.status'))}">${badge(m.paid ? 'paid' : 'unpaid', m.paid ? t('status.paid') : t('status.unpaid'))}</td>
      <td class="center" data-label="${esc(t('monthly.table.action'))}">
        ${m.paid
          ? `<button class="ghost-btn admin-only" type="button" data-unpay="${m.id}"${adm()}>${esc(t('action.mark_unpaid'))}</button>`
          : `<button class="primary-btn admin-only" type="button" data-pay="${m.id}"${adm()}>${esc(t('action.mark_paid'))}</button>`}
      </td>
    </tr>`).join('');

  root.innerHTML = `
    <section class="kpis kpis-5">
      <div class="kpi">
        <div class="kpi-ico">◉</div>
        <div class="kpi-label">${esc(t('dashboard.kpi.members'))}</div>
        <div class="kpi-value"><span data-count="${ms.total}">${ms.total}</span></div>
        <div class="kpi-sub">${esc(t('dashboard.kpi.active'))}: <strong>${ms.active}</strong></div>
      </div>
      <div class="kpi kpi-grad-1">
        <div class="kpi-ico">▤</div>
        <div class="kpi-label">${esc(t('dashboard.kpi.this_month'))} • ${esc(monthName(d.month, STATE.lang))}</div>
        <div class="kpi-value">${esc(a(cm.collected).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(cm.collected).mm)}</div>
      </div>
      <div class="kpi kpi-grad-2">
        <div class="kpi-ico">▦</div>
        <div class="kpi-label">${esc(t('dashboard.this_year'))} ${d.year}</div>
        <div class="kpi-value">${esc(a(d.year_total).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(d.year_total).mm)}</div>
      </div>
      <div class="kpi kpi-grad-3">
        <div class="kpi-ico">↗</div>
        <div class="kpi-label">${esc(t('dashboard.kpi.loans'))}</div>
        <div class="kpi-value">${esc(a(LA.outstanding).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(LA.outstanding).mm)} • ${esc(t('loans.active'))}: <strong>${LA.active}</strong></div>
      </div>
      <div class="kpi kpi-grad-3">
        <div class="kpi-ico">◈</div>
        <div class="kpi-label">${esc(t('spend.balance'))} / ${esc(t('dashboard.kpi.all_time'))}</div>
        <div class="kpi-value">${esc(a(avail).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(avail).mm)}</div>
      </div>
    </section>

    <section class="kpis spend-cards" style="margin-top:14px">
      ${spendCard('↘', t('spend.kpi.total'), spent, spendRatio, '', `${spendRatio}% ${t('spend.kpi.of_collected')}`)}
      ${spendCard('▦', `${t('spend.kpi.this_month')} • ${shortMonthName(d.month, STATE.lang)}`, cm.spent, pct(cm.spent, cm.collected), 'kpi-progress-fill-warn', `${pct(cm.spent, cm.collected)}% ${t('spend.kpi.of_collected')}`)}
      ${spendCard('▤', `${t('spend.kpi.this_year')} ${d.year}`, d.year_spent, pct(d.year_spent, d.year_total), 'kpi-progress-fill-accent', `${pct(d.year_spent, d.year_total)}% ${t('spend.kpi.of_collected')}`)}
      ${spendCard('✦', t('spend.kpi.avg_per_month'), avgPerMonth(d), pct(avail, d.all_time), 'kpi-progress-fill-good', `${t('spend.kpi.remaining')}: ${a(avail).en}`)}
    </section>

    <section class="row-grid" style="margin-top:16px">
      <div class="chart-card">
        <div class="chart-head">
          <h3>${esc(t('dashboard.trend'))}</h3>
          <div class="chart-tabs">${rangeTabs}</div>
        </div>
        ${lineChart(lineData, {
          emptyLabel: t('empty.nothing'),
          tooltip: (p) => `<strong>${esc(p.label)}</strong><div>${esc(a(p.y).en)} MMK</div><div class="amount-text">${esc(a(p.y).mm)}</div>${p.extra ? `<div class="muted">${t('dashboard.paid')}: ${p.extra.paid}</div>` : ''}`,
        })}
      </div>
      <div class="chart-card">
        <div class="chart-head">
          <h3>${esc(t('spend.list'))}</h3>
          <button class="primary-btn admin-only" id="spend-btn" type="button"${adm()}>${esc(t('spend.add'))}</button>
        </div>
        <div class="list">${expenseList}</div>
        ${d.recent_expenses.length ? `<div class="muted" style="margin-top:8px;text-align:right">${esc(t('spend.total'))}: ${amtHtml(spent)}</div>` : ''}
      </div>
    </section>

    <section class="row-grid" style="margin-top:16px">
      <div class="chart-card">
        <div class="chart-head"><h3>${esc(t('dashboard.expected_compared'))}</h3></div>
        ${groupedBar([
          { label: t('dashboard.expected'), value: cm.expected, color: 'var(--primary-2)' },
          { label: t('dashboard.collected'), value: Math.min(cm.collected, cm.expected), color: 'var(--good)' },
          { label: t('dashboard.remaining'), value: cm.remaining, color: 'var(--bad)' },
        ], { emptyLabel: t('empty.nothing') })}
      </div>
      <div class="chart-card">
        <div class="chart-head">
          <h3>${esc(t('dashboard.top'))}</h3>
          <span class="muted" style="font-size:12px">${esc(t('dashboard.top_sub'))}</span>
        </div>
        <div class="list">${topList || `<div class="empty" style="margin:0">${esc(t('empty.nothing'))}</div>`}</div>
      </div>
    </section>

    <section class="row-grid-equal" style="margin-top:16px">
      <div class="chart-card">
        <div class="chart-head"><h3>${esc(t('dashboard.monthly_totals'))}</h3></div>
        <div class="table-wrap">
          <table class="t">
            <thead><tr>
              <th>${esc(t('reports.col.month'))}</th>
              <th class="num">${esc(t('reports.col.collected'))}</th>
              <th class="num">${esc(t('reports.col.expected'))}</th>
              <th class="num">${esc(t('reports.col.remaining'))}</th>
              <th class="center">${esc(t('reports.col.rate'))}</th>
            </tr></thead>
            <tbody>${totalsRows}</tbody>
          </table>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-head"><h3>${esc(t('dashboard.member_status'))}</h3></div>
        <div class="table-wrap">
          <table class="t">
            <thead><tr>
              <th>${esc(t('monthly.table.member'))}</th>
              <th class="num">${esc(t('monthly.table.target'))}</th>
              <th class="num">${esc(t('monthly.table.amount'))}</th>
              <th class="center">${esc(t('monthly.table.status'))}</th>
              <th class="center">${esc(t('monthly.table.action'))}</th>
            </tr></thead>
            <tbody>${statusRows}</tbody>
          </table>
        </div>
      </div>
    </section>`;

  qsa('[data-range]', root).forEach((b) => b.onclick = () => { VSTATE.range = b.getAttribute('data-range'); refresh(); });
  const spendBtn = qs('#spend-btn', root);
  if (spendBtn) spendBtn.onclick = () => openSpendModal(avail);
  qsa('[data-pay]', root).forEach((b) => b.onclick = () => openPaymentModal({ member_id: Number(b.getAttribute('data-pay')), month: d.month }));
  qsa('[data-unpay]', root).forEach((b) => b.onclick = () => openPaymentModal({ member_id: Number(b.getAttribute('data-unpay')), month: d.month, unpaid: true }));
  bindChartTooltips(root);
  bindCountUps(root);
}

/* ================================================================= monthly */
function viewMonthly(root) {
  setPageTitle(t('monthly.title'));
  const d = dashboard({ month: STATE.month, year: STATE.year });
  const cm = d.current;
  const pays = paymentsList({ month: STATE.month });
  const paidMap = new Map(pays.map((p) => [p.member_id, p]));
  const rows = d.member_status;
  const a = (n) => formatAmount(n, STATE.mode);

  const sel = VSTATE.monthlySel;
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const body = rows.map((m) => {
    const p = paidMap.get(m.id);
    return `<tr>
      <td><input type="checkbox" data-sel="${m.id}"${sel.has(m.id) ? ' checked' : ''} /></td>
      <td>${esc(m.name)}</td>
      <td class="num">${amtHtml(m.expected)}</td>
      <td class="num">${amtHtml(m.amount)}</td>
      <td class="center">${badge(m.paid ? 'paid' : 'unpaid', m.paid ? t('status.paid') : t('status.unpaid'))}</td>
      <td class="muted">${m.paid && p ? esc(p.paid_at || '') : ''}</td>
      <td class="center">
        ${m.paid
          ? `<div class="row">
              <button class="ghost-btn admin-only" type="button" data-edit="${m.id}"${adm()}>${esc(t('action.edit'))}</button>
              <button class="danger-btn admin-only" type="button" data-del="${m.id}"${adm()}>${esc(t('action.delete'))}</button>
            </div>`
          : `<button class="primary-btn admin-only" type="button" data-edit="${m.id}"${adm()}>${esc(t('action.mark_paid'))}</button>`}
      </td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="spread" style="margin-bottom:14px">
      <div class="row">
        <button class="ghost-btn" type="button" data-nav="-1">${esc(t('monthly.prev'))}</button>
        <strong style="font-size:18px">${esc(monthName(STATE.month, STATE.lang))}</strong>
        <button class="ghost-btn" type="button" data-nav="1">${esc(t('monthly.next'))}</button>
      </div>
      <div class="row">
        <button class="ghost-btn admin-only" type="button" id="bulk-btn"${adm()}>${esc(t('action.bulk_pay'))}</button>
      </div>
    </div>

    <div class="row-grid-3" style="margin-bottom:14px">
      <div class="section">
        <div class="muted">${esc(t('dashboard.expected'))}</div>
        <div style="font-size:22px;font-weight:800">${esc(a(cm.expected).en)}</div>
        <div class="amount-text muted">${esc(a(cm.expected).mm)}</div>
      </div>
      <div class="section">
        <div class="muted">${esc(t('dashboard.collected'))}</div>
        <div style="font-size:22px;font-weight:800">${esc(a(cm.collected).en)}</div>
        <div class="amount-text muted">${esc(a(cm.collected).mm)}</div>
      </div>
      <div class="section">
        <div class="muted">${esc(t('dashboard.remaining'))} / ${esc(t('dashboard.surplus'))}</div>
        <div style="font-size:22px;font-weight:800">${esc(a(cm.remaining).en)}${cm.surplus ? ` +${esc(a(cm.surplus).en)}` : ''}</div>
        <div class="amount-text muted">${esc(a(cm.remaining).mm)}${cm.surplus ? ` +${esc(a(cm.surplus).mm)}` : ''}</div>
      </div>
    </div>

    <div class="table-wrap">
      <table class="t">
        <thead><tr>
          <th><label class="checkbox"><input type="checkbox" id="sel-all"${allSel ? ' checked' : ''} /><span class="muted">${esc(t('monthly.select_all'))}</span></label></th>
          <th>${esc(t('monthly.table.member'))}</th>
          <th class="num">${esc(t('monthly.table.target'))}</th>
          <th class="num">${esc(t('monthly.table.amount'))}</th>
          <th class="center">${esc(t('monthly.table.status'))}</th>
          <th>${esc(t('monthly.table.paid_at'))}</th>
          <th class="center">${esc(t('monthly.table.action'))}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  qsa('[data-nav]', root).forEach((b) => b.onclick = () => {
    setPref('month', addMonth(STATE.month, Number(b.getAttribute('data-nav'))));
    VSTATE.monthlySel = new Set();
    refresh();
  });
  const bulk = qs('#bulk-btn', root);
  if (bulk) bulk.onclick = () => openBulkModal();

  qsa('[data-sel]', root).forEach((cb) => cb.onchange = () => {
    const id = Number(cb.getAttribute('data-sel'));
    if (cb.checked) sel.add(id); else sel.delete(id);
    const all = qs('#sel-all', root);
    if (all) all.checked = rows.every((r) => sel.has(r.id));
  });
  const selAll = qs('#sel-all', root);
  if (selAll) selAll.onchange = () => {
    if (selAll.checked) rows.forEach((r) => sel.add(r.id));
    else sel.clear();
    qsa('[data-sel]', root).forEach((cb) => { cb.checked = sel.has(Number(cb.getAttribute('data-sel'))); });
  };

  qsa('[data-edit]', root).forEach((b) => b.onclick = () => {
    const id = Number(b.getAttribute('data-edit'));
    const m = rows.find((x) => x.id === id);
    const p = paidMap.get(id);
    openPaymentModal(p
      ? { id: p.id, member_id: id, month: STATE.month, amount: p.amount, paid_at: p.paid_at, note: p.note }
      : { member_id: id, month: STATE.month });
    void m;
  });

  qsa('[data-del]', root).forEach((b) => b.onclick = async () => {
    if (!guard()) return;
    const id = Number(b.getAttribute('data-del'));
    const p = paidMap.get(id);
    if (!p) return;
    const yes = await confirmAsk(`${t('action.delete')}?`);
    if (!yes) return;
    try {
      deletePayment(p.id);
      toast(t('payment.deleted'), 'good');
      refresh();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ================================================================= members */
function viewMembers(root) {
  setPageTitle(t('members.title'));
  const dash = dashboard({ month: STATE.month, year: STATE.year });
  const statusMap = new Map(dash.member_status.map((x) => [x.id, x]));

  root.innerHTML = `
    <div class="spread" style="margin-bottom:14px">
      <div class="row" style="gap:8px">
        <input id="m-search" class="select" placeholder="${esc(t('members.search_ph'))}" value="${esc(VSTATE.memberQuery)}" />
        <select id="m-filter" class="select">
          <option value="">${esc(t('members.filter.all'))}</option>
          <option value="1">${esc(t('members.filter.active'))}</option>
          <option value="0">${esc(t('members.filter.inactive'))}</option>
        </select>
      </div>
      <button class="primary-btn" type="button" id="add-member"${adm()}>${esc(t('members.add'))}</button>
    </div>
    <div id="member-grid"></div>`;

  const grid = qs('#member-grid', root);
  const filterSel = qs('#m-filter', root);
  filterSel.value = VSTATE.memberFilter;

  const renderGrid = () => {
    const items = membersList({ q: VSTATE.memberQuery, active: VSTATE.memberFilter });
    if (!items.length) {
      grid.innerHTML = `<div class="empty">${esc(t('members.empty'))}</div>`;
      return;
    }
    grid.innerHTML = `<div class="member-grid">${items.map((m) => {
      const sm = statusMap.get(m.id) || { paid: false, expected: m.monthly_amount, amount: 0 };
      const a = formatAmount(m.total_saved, STATE.mode);
      return `<div class="member-card">
        <div class="avatar">${esc((m.name || '?').trim().charAt(0).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div class="spread">
            <div>
              <div style="font-weight:700">${esc(m.name)}</div>
              <div class="muted" style="font-size:12px">
                ${m.active ? '<span class="tag">Active</span>' : '<span class="tag" style="background:#fee2e2;color:#991b1b">Inactive</span>'}
                • ID ${m.id}
              </div>
            </div>
            <div>
              <div class="amt-exact">${esc(STATE.lang === 'mm' ? a.mm : a.en)}</div>
              <div class="amt-units amount-text">${esc(a.mm)}</div>
            </div>
          </div>
          <div class="member-meta" style="margin-top:8px">
            <div>${esc(t('members.total_saved'))}: <strong>${esc(formatMoney(m.total_saved))}</strong></div>
            <div>${esc(t('members.paid_months'))}: <strong>${m.paid_months}</strong></div>
            <div>${esc(t('field.monthly_amount'))}: <strong>${amtHtml(m.monthly_amount)}</strong></div>
            <div>${esc(t('members.current_status'))}: <strong>${badge(sm.paid ? 'paid' : 'unpaid', sm.paid ? t('status.paid') : t('status.unpaid'))}</strong></div>
          </div>
          <div class="member-actions">
            <button class="ghost-btn" type="button" data-open="${m.id}">${esc(t('action.edit'))}</button>
            <button class="ghost-btn admin-only" type="button" data-edit="${m.id}"${adm()}>${esc(t('member.title'))}</button>
            <button class="ghost-btn admin-only" type="button" data-toggle="${m.id}"${adm()}>${esc(m.active ? t('action.deactivate') : t('action.activate'))}</button>
            <button class="danger-btn admin-only" type="button" data-remove="${m.id}" data-name="${esc(m.name)}"${adm()}>${esc(t('action.delete'))}</button>
          </div>
        </div>
      </div>`;
    }).join('')}</div>`;

    qsa('[data-open]', grid).forEach((b) => b.onclick = () => { location.hash = '#/members/' + b.getAttribute('data-open'); });
    qsa('[data-edit]', grid).forEach((b) => b.onclick = () => openMemberModal(getMember(b.getAttribute('data-edit'))));
    qsa('[data-toggle]', grid).forEach((b) => b.onclick = async () => {
      if (!guard()) return;
      try { toggleMember(Number(b.getAttribute('data-toggle'))); refresh(); } catch (err) { toast(err.message, 'bad'); }
    });
    qsa('[data-remove]', grid).forEach((b) => b.onclick = async () => {
      if (!guard()) return;
      const yes = await confirmAsk(`${t('action.delete')} ${b.getAttribute('data-name')}?`);
      if (!yes) return;
      try {
        deleteMember(Number(b.getAttribute('data-remove')));
        toast(t('member.deleted'), 'good');
        refresh();
      } catch (err) { toast(err.message, 'bad'); }
    });
  };

  renderGrid();

  const search = qs('#m-search', root);
  const onSearch = debounce(() => { VSTATE.memberQuery = search.value; renderGrid(); }, 200);
  search.addEventListener('input', onSearch);
  filterSel.addEventListener('change', () => { VSTATE.memberFilter = filterSel.value; renderGrid(); });
  qs('#add-member', root).onclick = () => openMemberModal(null);
}

/* =========================================================== member profile */
function viewMember(root, id) {
  setPageTitle(t('member.profile'));
  let data;
  try { data = memberProfile(id); } catch { root.innerHTML = `<div class="empty">404</div>`; return; }
  const m = data.member;
  const tot = data.totals;
  const loanData = loansList({ member_id: m.id });
  const myLoans = loanData.items;
  const s = loanData.summary;
  const a = (n) => formatAmount(n, STATE.mode);

  const lineData = data.months.map((row) => ({
    x: row.month,
    y: row.paid ? row.amount : 0,
    label: monthName(row.month, STATE.lang),
    shortLabel: monthName(row.month, STATE.lang),
  }));

  const historyRows = data.months.map((row) => `
    <tr>
      <td>${esc(monthName(row.month, STATE.lang))}</td>
      <td class="center">${badge(row.paid ? 'paid' : 'unpaid', row.paid ? t('status.paid') : t('status.unpaid'))}</td>
      <td class="num">${amtHtml(row.paid ? row.amount : row.expected)}</td>
      <td class="muted">${row.paid ? esc(row.paid_at || '') : ''}</td>
      <td class="muted">${esc(row.note || '')}</td>
      <td class="center">
        ${row.paid
          ? `<div class="row">
              <button class="ghost-btn admin-only" type="button" data-pedit="${row.month}"${adm()}>${esc(t('action.edit'))}</button>
              <button class="danger-btn admin-only" type="button" data-pdel="${row.month}"${adm()}>${esc(t('action.delete'))}</button>
            </div>`
          : `<button class="primary-btn admin-only" type="button" data-pedit="${row.month}"${adm()}>${esc(t('action.mark_paid'))}</button>`}
      </td>
    </tr>`).join('');

  const loanRows = myLoans.map((l) => `
    <tr>
      <td>${esc((l.borrowed_at || '').slice(0, 10))}</td>
      <td class="num">${amtHtml(l.amount)}</td>
      <td class="num">${amtHtml(l.interest)}</td>
      <td class="num">${amtHtml(l.total_due)}</td>
      <td class="num">${amtHtml(l.repaid)}</td>
      <td class="num">${amtHtml(l.outstanding)}</td>
      <td class="center">${badge(l.status === 'paid' ? 'paid' : 'warn', l.status === 'paid' ? t('loans.filter.paid') : t('loans.filter.active'))}</td>
      <td class="center">
        <div class="row" style="gap:6px;justify-content:center">
          <button class="primary-btn admin-only" type="button" data-repay="${l.id}"${adm()}>${esc(t('loans.repay'))}</button>
          <button class="ghost-btn admin-only" type="button" data-ledit="${l.id}"${adm()}>${esc(t('action.edit'))}</button>
          <button class="danger-btn admin-only" type="button" data-ldel="${l.id}"${adm()}>${esc(t('action.delete'))}</button>
        </div>
      </td>
    </tr>`).join('');

  root.innerHTML = `
    <div class="row-grid-31">
      <div class="section">
        <div class="row" style="gap:12px">
          <div class="avatar" style="width:64px;height:64px;font-size:24px">${esc((m.name || '?').charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-size:20px;font-weight:800">${esc(m.name)}</div>
            <div class="muted">ID #${m.id} • ${esc(m.active ? t('field.active') : t('action.deactivate'))}</div>
          </div>
        </div>
        <div class="row-grid-3" style="margin-top:14px">
          <div class="section">
            <div class="muted">${esc(t('member.expected'))}</div>
            <div style="font-weight:800;font-size:18px">${esc(a(m.monthly_amount).en)}</div>
            <div class="amount-text muted">${esc(a(m.monthly_amount).mm)}</div>
          </div>
          <div class="section">
            <div class="muted">${esc(t('member.total_saved'))}</div>
            <div style="font-weight:800;font-size:18px">${esc(a(tot.total_saved).en)}</div>
            <div class="amount-text muted">${esc(a(tot.total_saved).mm)}</div>
          </div>
          <div class="section">
            <div class="muted">${esc(t('member.avg'))}</div>
            <div style="font-weight:800;font-size:18px">${esc(a(tot.avg).en)}</div>
            <div class="amount-text muted">${esc(a(tot.avg).mm)}</div>
          </div>
        </div>
        <div class="progress" style="margin-top:12px"><span style="width:${Math.min(100, tot.rate)}%"></span></div>
        <div class="muted" style="margin-top:6px">
          ${esc(t('member.paid_months'))}: <strong>${tot.paid_months}</strong> / ${tot.expected_months}
          • ${esc(t('member.rate'))}: <strong>${tot.rate}%</strong>
        </div>
        <div class="member-actions">
          <button class="ghost-btn" type="button" id="edit-member">${esc(t('action.edit'))}</button>
          <button class="ghost-btn admin-only" type="button" id="toggle-member"${adm()}>${esc(m.active ? t('action.deactivate') : t('action.activate'))}</button>
          <button class="danger-btn admin-only" type="button" id="delete-member"${adm()}>${esc(t('action.delete'))}</button>
        </div>
      </div>
      <div class="section">
        <h3>${esc(t('member.profile'))}</h3>
        <div class="muted">${esc(t('field.note'))}: ${esc(m.note || '—')}</div>
        ${lineChart(lineData, {
          emptyLabel: t('empty.nothing'),
          tooltip: (p) => `<strong>${esc(p.label)}</strong><div>${esc(a(p.y).en)} MMK</div><div class="amount-text">${esc(a(p.y).mm)}</div>`,
        })}
      </div>
    </div>

    <div class="section" style="margin-top:16px">
      <h3>${esc(t('member.history'))}</h3>
      <div class="table-wrap">
        <table class="t">
          <thead><tr>
            <th>${esc(t('reports.col.month'))}</th>
            <th class="center">${esc(t('monthly.table.status'))}</th>
            <th class="num">${esc(t('monthly.table.amount'))}</th>
            <th>${esc(t('monthly.table.paid_at'))}</th>
            <th>${esc(t('field.note'))}</th>
            <th class="center">${esc(t('monthly.table.action'))}</th>
          </tr></thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>
    </div>

    <div class="section" style="margin-top:16px">
      <div class="chart-head">
        <h3>${esc(t('member.loans'))}</h3>
        <button class="primary-btn admin-only" type="button" id="add-loan"${adm()}>${esc(t('loans.add'))}</button>
      </div>
      <div class="muted" style="margin:6px 0 10px">
        ${esc(t('loans.total_borrowed'))}: <strong>${esc(a(s.total_borrowed).en)}</strong>
        • ${esc(t('loans.outstanding'))}: <strong>${esc(a(s.outstanding).en)}</strong>
      </div>
      ${myLoans.length ? `<div class="table-wrap">
        <table class="t">
          <thead><tr>
            <th>${esc(t('loans.borrowed_at'))}</th>
            <th class="num">${esc(t('loans.principal'))}</th>
            <th class="num">${esc(t('loans.interest'))}</th>
            <th class="num">${esc(t('loans.total_due'))}</th>
            <th class="num">${esc(t('loans.repaid'))}</th>
            <th class="num">${esc(t('loans.outstanding'))}</th>
            <th class="center">${esc(t('field.status'))}</th>
            <th class="center">${esc(t('monthly.table.action'))}</th>
          </tr></thead>
          <tbody>${loanRows}</tbody>
        </table>
      </div>` : `<div class="empty" style="margin:0">${esc(t('loans.empty'))}</div>`}
    </div>`;

  qs('#edit-member', root).onclick = () => openMemberModal(m);
  qs('#toggle-member', root).onclick = async () => {
    if (!guard()) return;
    try { toggleMember(m.id); refresh(); } catch (err) { toast(err.message, 'bad'); }
  };
  qs('#delete-member', root).onclick = async () => {
    if (!guard()) return;
    const yes = await confirmAsk(`${t('action.delete')} ${m.name}?`);
    if (!yes) return;
    try {
      deleteMember(m.id);
      toast(t('member.deleted'), 'good');
      location.hash = '#/members';
    } catch (err) { toast(err.message, 'bad'); }
  };
  qs('#add-loan', root).onclick = () => openLoanModal(null, { member_id: m.id });

  qsa('[data-pedit]', root).forEach((b) => b.onclick = () => {
    const month = b.getAttribute('data-pedit');
    const row = data.months.find((x) => x.month === month);
    openPaymentModal(row && row.paid
      ? { id: row.id, member_id: m.id, month, amount: row.amount, paid_at: row.paid_at, note: row.note }
      : { member_id: m.id, month });
  });
  qsa('[data-pdel]', root).forEach((b) => b.onclick = async () => {
    if (!guard()) return;
    const month = b.getAttribute('data-pdel');
    const row = data.months.find((x) => x.month === month);
    if (!row) return;
    const yes = await confirmAsk(`${t('action.delete')}?`);
    if (!yes) return;
    try { deletePayment(row.id); toast(t('payment.deleted'), 'good'); refresh(); } catch (err) { toast(err.message, 'bad'); }
  });

  qsa('[data-repay]', root).forEach((b) => b.onclick = () => openLoanPaymentModal(Number(b.getAttribute('data-repay'))));
  qsa('[data-ledit]', root).forEach((b) => b.onclick = () => {
    const l = myLoans.find((x) => x.id === Number(b.getAttribute('data-ledit')));
    openLoanModal(l);
  });
  qsa('[data-ldel]', root).forEach((b) => b.onclick = async () => {
    if (!guard()) return;
    const yes = await confirmAsk(`${t('action.delete')}?`);
    if (!yes) return;
    try { deleteLoan(Number(b.getAttribute('data-ldel'))); toast(t('loans.deleted'), 'good'); refresh(); } catch (err) { toast(err.message, 'bad'); }
  });

  bindChartTooltips(root);
}

/* =================================================================== loans */
function viewLoans(root) {
  setPageTitle(t('loans.title'));
  const filter = VSTATE.loanFilter;
  const data = loansList(filter === 'all' ? {} : { status: filter });
  const items = data.items;
  const s = data.summary;
  const a = (n) => formatAmount(n, STATE.mode);

  const tabs = ['all', 'active', 'paid'].map((f) =>
    `<button type="button" class="${filter === f ? 'active' : ''}" data-tab="${f}">${f === 'all' ? esc(t('common.all')) : f === 'active' ? esc(t('loans.filter.active')) : esc(t('loans.filter.paid'))}</button>`).join('');

  const rows = items.map((l) => `
    <tr>
      <td data-label="${esc(t('field.member'))}">${esc(l.member_name)}</td>
      <td data-label="${esc(t('loans.borrowed_at'))}">${esc((l.borrowed_at || '').slice(0, 10))}</td>
      <td class="num" data-label="${esc(t('loans.principal'))}">${amtHtml(l.amount)}</td>
      <td class="num" data-label="${esc(t('loans.interest'))}">${amtHtml(l.interest)}</td>
      <td class="num" data-label="${esc(t('loans.total_due'))}">${amtHtml(l.total_due)}</td>
      <td class="num" data-label="${esc(t('loans.repaid'))}">${amtHtml(l.repaid)}</td>
      <td class="num" data-label="${esc(t('loans.outstanding'))}">${amtHtml(l.outstanding)}</td>
      <td class="center" data-label="${esc(t('field.status'))}">${badge(l.status === 'paid' ? 'paid' : 'warn', l.status === 'paid' ? t('loans.filter.paid') : t('loans.filter.active'))}</td>
      <td class="center" data-label="${esc(t('monthly.table.action'))}">
        <div class="row" style="gap:6px;justify-content:center">
          <button class="primary-btn admin-only" type="button" data-repay="${l.id}"${adm()}>${esc(t('loans.repay'))}</button>
          <button class="ghost-btn admin-only" type="button" data-edit="${l.id}"${adm()}>${esc(t('action.edit'))}</button>
          <button class="danger-btn admin-only" type="button" data-del="${l.id}"${adm()}>${esc(t('action.delete'))}</button>
        </div>
      </td>
    </tr>`).join('');

  root.innerHTML = `
    <section class="kpis">
      <div class="kpi">
        <div class="kpi-ico">↗</div><div class="kpi-label">${esc(t('loans.total_borrowed'))}</div>
        <div class="kpi-value">${esc(a(s.total_borrowed).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(s.total_borrowed).mm)}</div>
      </div>
      <div class="kpi kpi-grad-3">
        <div class="kpi-ico">◔</div><div class="kpi-label">${esc(t('loans.outstanding'))}</div>
        <div class="kpi-value">${esc(a(s.outstanding).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(s.outstanding).mm)}</div>
      </div>
      <div class="kpi kpi-grad-1">
        <div class="kpi-ico">↙</div><div class="kpi-label">${esc(t('loans.total_repaid'))}</div>
        <div class="kpi-value">${esc(a(s.total_repaid).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(s.total_repaid).mm)}</div>
      </div>
      <div class="kpi kpi-grad-2">
        <div class="kpi-ico">✦</div><div class="kpi-label">${esc(t('loans.total_interest'))}</div>
        <div class="kpi-value">${esc(a(s.total_interest).en)}</div>
        <div class="kpi-sub amount-text">${esc(a(s.total_interest).mm)}</div>
      </div>
    </section>

    <div class="section" style="margin-top:16px">
      <div class="chart-head">
        <h3>${esc(t('loans.list'))}</h3>
        <div class="row" style="gap:8px">
          <div class="chart-tabs">${tabs}</div>
          <button class="primary-btn admin-only" type="button" id="add-loan"${adm()}>${esc(t('loans.add'))}</button>
        </div>
      </div>
      <div class="muted" style="margin:6px 0 10px">
        ${esc(t('loans.active'))}: <strong>${s.active_count}</strong>
        • ${esc(t('loans.paid'))}: <strong>${s.paid_count}</strong>
      </div>
      ${items.length ? `<div class="table-wrap">
        <table class="t">
          <thead><tr>
            <th>${esc(t('field.member'))}</th>
            <th>${esc(t('loans.borrowed_at'))}</th>
            <th class="num">${esc(t('loans.principal'))}</th>
            <th class="num">${esc(t('loans.interest'))}</th>
            <th class="num">${esc(t('loans.total_due'))}</th>
            <th class="num">${esc(t('loans.repaid'))}</th>
            <th class="num">${esc(t('loans.outstanding'))}</th>
            <th class="center">${esc(t('field.status'))}</th>
            <th class="center">${esc(t('monthly.table.action'))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<div class="empty">${esc(t('loans.empty'))}</div>`}
    </div>`;

  qsa('[data-tab]', root).forEach((b) => b.onclick = () => { VSTATE.loanFilter = b.getAttribute('data-tab'); refresh(); });
  qs('#add-loan', root).onclick = () => openLoanModal(null, {});
  qsa('[data-repay]', root).forEach((b) => b.onclick = () => openLoanPaymentModal(Number(b.getAttribute('data-repay'))));
  qsa('[data-edit]', root).forEach((b) => b.onclick = () => {
    const l = items.find((x) => x.id === Number(b.getAttribute('data-edit')));
    openLoanModal(l);
  });
  qsa('[data-del]', root).forEach((b) => b.onclick = async () => {
    if (!guard()) return;
    const yes = await confirmAsk(`${t('action.delete')}?`);
    if (!yes) return;
    try { deleteLoan(Number(b.getAttribute('data-del'))); toast(t('loans.deleted'), 'good'); refresh(); } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ================================================================ expenses */
function viewExpenses(root) {
  setPageTitle(t('expenses.title'));
  const items = expensesList();
  const dash = dashboard({ month: STATE.month, year: STATE.year });
  const total = items.reduce((a, e) => a + (e.amount || 0), 0);

  const byMonth = {};
  for (const e of items) {
    const key = (e.spent_at || '').slice(0, 7);
    (byMonth[key] = byMonth[key] || []).push(e);
  }
  const months = Object.keys(byMonth).sort().reverse();
  const monthCounts = months.map((m) => byMonth[m].length);
  const monthTotals = months.map((m) => byMonth[m].reduce((a, e) => a + (e.amount || 0), 0));

  const monthList = months.length > 1 ? `<div class="exp-months">${months.map((m, i) => `
    <div class="list-item">
      <div class="rank">▤</div>
      <div><div class="name">${esc(monthName(m, STATE.lang))}</div><div class="meta">${monthCounts[i]} ${esc(STATE.lang === 'mm' ? 'ခု' : 'items')}</div></div>
      <div class="amt">${amtHtml(monthTotals[i])}</div>
    </div>`).join('')}</div>` : '';

  const table = items.length ? `<div class="table-wrap">
      <table class="t">
        <thead><tr>
          <th>${esc(t('spend.date'))}</th>
          <th>${esc(t('spend.reason'))}</th>
          <th>${esc(t('field.note'))}</th>
          <th class="num">${esc(t('spend.amount'))}</th>
          <th class="center">${esc(t('monthly.table.action'))}</th>
        </tr></thead>
        <tbody>${items.map((e) => `
          <tr>
            <td>${esc((e.spent_at || '').slice(0, 10))}</td>
            <td>${esc(e.reason || '—')}</td>
            <td class="muted">${esc(e.note || '')}</td>
            <td class="num">${amtHtml(e.amount)}</td>
            <td class="center"><button class="danger-btn admin-only" type="button" data-del="${e.id}"${adm()}>${esc(t('action.delete'))}</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>` : `<div class="empty">${esc(t('spend.empty'))}</div>`;

  root.innerHTML = `<div class="row-grid-equal">
    <div class="section">
      <h3>${esc(t('expenses.summary'))}</h3>
      <div class="grid" style="gap:10px">
        <div>
          <div class="muted">${esc(t('spend.total'))}</div>
          <div style="font-size:24px;font-weight:800">${esc(formatAmount(total, STATE.mode).en)}</div>
          <div class="amount-text muted">${esc(formatAmount(total, STATE.mode).mm)}</div>
        </div>
        <div class="row"><button class="primary-btn admin-only" type="button" id="add-spend"${adm()}>${esc(t('spend.add'))}</button></div>
        ${monthList}
      </div>
    </div>
    <div class="section">
      <h3>${esc(t('spend.list'))}</h3>
      ${table}
    </div>
  </div>`;

  qs('#add-spend', root).onclick = () => openSpendModal(dash.available || 0);
  qsa('[data-del]', root).forEach((b) => b.onclick = async () => {
    if (!guard()) return;
    const yes = await confirmAsk(`${t('action.delete')}?`);
    if (!yes) return;
    try { deleteExpense(Number(b.getAttribute('data-del'))); toast(t('spend.deleted'), 'good'); refresh(); } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ================================================================= reports */
function viewReports(root) {
  setPageTitle(t('reports.title'));
  const tab = VSTATE.reportTab;
  const data = reports(tab);
  const rows = data.rows || [];
  const a = (n) => formatAmount(n, STATE.mode);

  let totalCollected = 0, totalExpected = 0, totalSurplus = 0;
  rows.forEach((r) => {
    totalCollected += r.collected || 0;
    totalExpected += r.expected || 0;
    totalSurplus += r.surplus || 0;
  });
  const overallRate = totalExpected > 0
    ? Math.round((Math.min(totalCollected, totalExpected) * 10000) / totalExpected) / 100 : 0;

  const kpis = [
    { label: t('reports.kpi.collected'), value: totalCollected, color: 'var(--good)', isPercent: false },
    { label: t('reports.kpi.expected'), value: totalExpected, color: 'var(--primary-2)', isPercent: false },
    { label: t('reports.kpi.surplus'), value: totalSurplus, color: 'var(--warn)', isPercent: false },
    { label: t('reports.kpi.rate'), value: overallRate, color: 'var(--accent)', isPercent: true },
  ];

  let chartItems = [];
  let listHtml = '';

  if (tab === 'all_month') {
    const desc = rows.slice().reverse();
    chartItems = desc.map((r) => ({
      label: shortMonthName(r.month, STATE.lang),
      value: r.collected,
      color: r.collected >= r.expected ? 'var(--good)' : (r.collected > 0 ? 'var(--warn)' : 'var(--bad)'),
    }));
    const asc = desc.slice().reverse();
    listHtml = asc.length ? asc.map((r) => {
      const rate = r.expected > 0 ? Math.round((Math.min(r.collected, r.expected) * 10000) / r.expected) / 100 : 0;
      const delta = r.surplus > 0 ? `+${a(r.surplus).en}` : (r.remaining > 0 ? `-${a(r.remaining).en}` : a(0).en);
      return `<div class="list-item">
        <div class="rank">${esc(shortMonthName(r.month, STATE.lang))}</div>
        <div>
          <div class="name">${esc(monthName(r.month, STATE.lang))}</div>
          <div class="meta">${r.paid} ${esc(t('status.paid'))} · ${r.unpaid} ${esc(t('status.unpaid'))} · ${rate}%</div>
        </div>
        ${sparkline([r.expected, r.collected])}
        <div class="amt">
          <div class="amt-exact">${esc(STATE.lang === 'mm' ? a(r.collected).mm : a(r.collected).en)}</div>
          <div class="amt-units amount-text muted">${esc(delta)}</div>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${esc(t('empty.nothing'))}</div>`;
  } else if (tab === 'yearly') {
    chartItems = rows.map((r) => ({ label: r.year, value: r.collected, color: 'var(--primary-2)' }));
    listHtml = rows.length ? rows.map((r) => `
      <div class="list-item">
        <div class="rank">${esc(r.year)}</div>
        <div><div class="name">${esc(r.year)}</div><div class="meta">${r.paid} ${esc(t('status.paid'))}</div></div>
        ${sparkline([r.collected])}
        <div class="amt">
          <div class="amt-exact">${esc(STATE.lang === 'mm' ? a(r.collected).mm : a(r.collected).en)}</div>
          <div class="amt-units amount-text muted">${esc(a(r.collected).mm)}</div>
        </div>
      </div>`).join('') : `<div class="empty">${esc(t('empty.nothing'))}</div>`;
  } else {
    const sorted = rows.slice().sort((x, y) => y.total - x.total);
    const max = Math.max(1, ...sorted.map((r) => r.total));
    chartItems = sorted.slice(0, 8).map((r) => ({ label: r.name, value: r.total, color: 'var(--accent)' }));
    listHtml = sorted.length ? sorted.map((r, i) => {
      const p = Math.round((r.total / max) * 100);
      return `<div class="list-item">
        <div class="rank">${i + 1}</div>
        <div>
          <div class="name">${esc(r.name)}</div>
          <div class="meta">${r.paid_months} ${esc(t('member.paid_months'))} · ${r.avg ? `${esc(a(r.avg).en)} ${esc(t('reports.col.avg'))}` : '-'}</div>
        </div>
        <div class="rep-bar"><div class="rep-bar-fill" style="width:${p}%"></div></div>
        <div class="amt">
          <div class="amt-exact">${esc(STATE.lang === 'mm' ? a(r.total).mm : a(r.total).en)}</div>
          <div class="amt-units amount-text muted">${esc(a(r.total).mm)}</div>
        </div>
      </div>`;
    }).join('') : `<div class="empty">${esc(t('empty.nothing'))}</div>`;
  }

  const tabs = [
    { key: 'all_month', label: 'reports.tab.all_month' },
    { key: 'yearly', label: 'reports.tab.yearly' },
    { key: 'member', label: 'reports.tab.member' },
  ].map((x) => `<button type="button" class="${tab === x.key ? 'active' : ''}" data-tab="${x.key}">${esc(t(x.label))}</button>`).join('');

  root.innerHTML = `
    <div class="chart-head" style="margin-bottom:12px">
      <h3>${esc(t('reports.title'))}</h3>
      <div class="chart-tabs">${tabs}</div>
    </div>
    <div class="kpis">${kpis.map((c) => {
      const av = a(c.value);
      const v = c.isPercent ? `${c.value}%` : av.en;
      const sub = c.isPercent
        ? `<div class="kpi-sub muted">${esc(overallRate >= 80 ? t('reports.kpi.healthy') : t('reports.kpi.watch'))}</div>`
        : `<div class="kpi-sub amount-text">${esc(av.mm)}</div>`;
      return `<div class="kpi">
        <div class="kpi-ico">◈</div>
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value" style="color:${c.color}">${esc(v)}</div>
        ${sub}
      </div>`;
    }).join('')}</div>
    <div class="row-grid" style="margin-top:16px">
      <div class="chart-card">
        <div class="chart-head"><h3>${esc(t('reports.chart.title'))}</h3></div>
        ${groupedBar(chartItems, { emptyLabel: t('empty.nothing') })}
      </div>
      <div class="chart-card">
        <div class="chart-head"><h3>${esc(t('reports.list.title'))}</h3></div>
        <div class="list">${listHtml}</div>
      </div>
    </div>`;

  qsa('[data-tab]', root).forEach((b) => b.onclick = () => { VSTATE.reportTab = b.getAttribute('data-tab'); refresh(); });
}

/* ================================================================ calendar */
function viewCalendar(root) {
  setPageTitle(t('calendar.title'));
  const pays = paymentsList({ month: STATE.month });
  const byDay = {};
  for (const p of pays) {
    if (!p.paid_at) continue;
    const day = p.paid_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const d = parseYyyymm(STATE.month);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const totalPayments = Object.values(byDay).reduce((x, y) => x + y, 0);

  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell" data-pad="${i}"></div>`;
  for (let day = 1; day <= last; day++) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cnt = byDay[ds] || 0;
    cells += `<div class="cal-cell">
      <div class="day">${day}</div>
      ${cnt ? `<span class="pip paid">${cnt} ${esc(STATE.lang === 'mm' ? 'ကြိမ်' : '')}</span>` : ''}
    </div>`;
  }

  root.innerHTML = `<div class="chart-card">
    <div class="chart-head">
      <div class="row">
        <button class="ghost-btn" type="button" data-nav="-1">${esc(t('monthly.prev'))}</button>
        <strong>${esc(monthName(STATE.month, STATE.lang))}</strong>
        <button class="ghost-btn" type="button" data-nav="1">${esc(t('monthly.next'))}</button>
      </div>
      <div class="muted">${totalPayments} ${esc(STATE.lang === 'mm' ? 'ကြိမ်' : 'payments')}</div>
    </div>
    <div class="cal">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n) => `<div class="cal-cell head">${n}</div>`).join('')}
      ${cells}
    </div>
  </div>`;

  qsa('[data-nav]', root).forEach((b) => b.onclick = () => {
    setPref('month', addMonth(STATE.month, Number(b.getAttribute('data-nav'))));
    refresh();
  });
}

/* ================================================================== backup */
function viewBackup(root) {
  setPageTitle(t('backup.title'));

  root.innerHTML = `<div class="row-grid">
    <div class="section">
      <h3>${esc(t('backup.title'))}</h3>
      <div class="row" style="flex-wrap:wrap">
        <button class="primary-btn admin-only" type="button" id="exp-json"${adm()}>${esc(t('backup.export_json'))}</button>
        <button class="ghost-btn admin-only" type="button" id="exp-csv"${adm()}>${esc(t('backup.export_csv'))}</button>
        <button class="ghost-btn" type="button" id="exp-reset">${esc(t('action.delete'))} DB</button>
      </div>
      <p class="muted" style="margin-top:8px">🔒 ${esc(t('login.locked_banner'))}</p>
      <p class="muted">localStorage: <span class="kbd">${esc(DB_KEY)}</span></p>
    </div>
    <div class="section">
      <h3>${esc(t('backup.import_json'))}</h3>
      <form class="import-form" id="import-form">
        <label class="field">
          <span>${esc(t('backup.mode'))}</span>
          <select class="select" name="mode">
            <option value="merge">${esc(t('backup.merge'))}</option>
            <option value="replace">${esc(t('backup.replace'))}</option>
          </select>
        </label>
        <label class="field">
          <span>${esc(t('field.name'))}</span>
          <input type="file" name="file" accept="application/json,.json" />
        </label>
        <p class="muted">${esc(t('backup.warning'))}</p>
        <div><button class="primary-btn admin-only" type="submit"${adm()}>${esc(t('action.import'))}</button></div>
      </form>
    </div>
  </div>`;

  const download = (name, text, mime) => {
    const type = mime || 'application/json;charset=utf-8';
    let href;
    try {
      const blob = new Blob([text], { type });
      href = URL.createObjectURL(blob);
    } catch {
      href = 'data:' + type + ',' + encodeURIComponent(text);
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  qs('#exp-json', root).onclick = () => {
    if (!guard()) return;
    download(`savings-backup-${todayISO()}.json`, JSON.stringify(exportPayload(), null, 2));
    toast(t('backup.export_json'), 'good');
  };
  qs('#exp-csv', root).onclick = () => {
    if (!guard()) return;
    download(`payments-${todayISO()}.csv`, exportCsv(), 'text/csv;charset=utf-8');
    toast(t('backup.export_csv'), 'good');
  };
  qs('#exp-reset', root).onclick = async () => {
    if (!guard()) return;
    const yes = await confirmAsk('Delete ALL local data?');
    if (!yes) return;
    Store.reset();
    toast('DB reset', 'good');
    refresh();
  };

  qs('#import-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!guard()) return;
    const form = e.target;
    const file = form.file.files && form.file.files[0];
    if (!file) { toast('Select a file', 'warn'); return; }
    try {
      const text = await file.text();
      importPayload(text, form.mode.value);
      toast(t('backup.imported'), 'good');
      form.reset();
      refresh();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ================================================================ settings */
function viewSettings(root) {
  setPageTitle(t('settings.title'));
  const s = getSettings();

  root.innerHTML = `<div class="row-grid">
    <div class="section">
      <h3>${esc(t('settings.general'))}</h3>
      <div class="grid" style="gap:12px">
        <label class="field">
          <span>${esc(t('settings.group_name'))}</span>
          <input type="text" name="group_name" value="${esc(s.group_name || 'Monthly Savings')}" />
        </label>
        <label class="field">
          <span>${esc(t('settings.default_amount'))}</span>
          <input type="text" name="default_amount" value="${esc(s.default_amount || '10000')}" />
          <div data-preview></div>
        </label>
        <label class="field">
          <span>${esc(t('settings.display_mode'))}</span>
          <select name="display_mode">
            <option value="exact">${esc(t('settings.display.exact'))}</option>
            <option value="units">${esc(t('settings.display.units'))}</option>
            <option value="both">${esc(t('settings.display.both'))}</option>
            <option value="auto">${esc(t('settings.display.auto'))}</option>
          </select>
        </label>
        <label class="field">
          <span>${esc(t('settings.theme'))}</span>
          <select name="theme">
            <option value="light">${esc(t('settings.theme.light'))}</option>
            <option value="dark">${esc(t('settings.theme.dark'))}</option>
            <option value="system">${esc(t('settings.theme.system'))}</option>
          </select>
        </label>
        <label class="field">
          <span>${esc(t('settings.language'))}</span>
          <select name="language">
            <option value="mm">မြန်မာ</option>
            <option value="en">English</option>
          </select>
        </label>
        <div><button class="primary-btn admin-only" type="button" id="save-settings"${adm()}>${esc(t('action.save'))}</button></div>
      </div>
    </div>

    <div class="section">
      <h3>${esc(t('admin.change_password'))}</h3>
      <div class="grid" style="gap:12px">
        <label class="field">
          <span>${esc(t('admin.current_password'))}</span>
          <input type="password" name="pw_cur" autocomplete="current-password" />
        </label>
        <label class="field">
          <span>${esc(t('admin.new_password'))}</span>
          <input type="password" name="pw_new" autocomplete="new-password" />
        </label>
        <div><button class="primary-btn admin-only" type="button" id="change-pw"${adm()}>${esc(t('admin.change_password'))}</button></div>
      </div>
      <h3 style="margin-top:18px">${esc(t('app.title'))}</h3>
      <p class="muted">${esc(t('app.subtitle'))}</p>
      <p class="muted">v1.0 • HTML/CSS/JS</p>
    </div>
  </div>`;

  const form = root;
  qs('[name=display_mode]', form).value = STATE.mode;
  qs('[name=theme]', form).value = STATE.theme;
  qs('[name=language]', form).value = STATE.lang;
  bindPreview(qs('[name=default_amount]', form), qs('[data-preview]', form));

  qs('#save-settings', form).onclick = () => {
    if (!guard()) return;
    const payload = {
      group_name: qs('[name=group_name]', form).value.trim() || 'Monthly Savings',
      default_amount: qs('[name=default_amount]', form).value,
      display_mode: qs('[name=display_mode]', form).value,
      theme: qs('[name=theme]', form).value,
      language: qs('[name=language]', form).value,
    };
    if (parseMyAmount(payload.default_amount) == null) { toast(t('amount.invalid'), 'warn'); return; }
    setSettings(payload);
    setPref('mode', payload.display_mode);
    setPref('theme', payload.theme);
    setPref('lang', payload.language);
    toast(t('settings.saved'), 'good');
    refresh();
  };

  qs('#change-pw', form).onclick = async () => {
    if (!guard()) return;
    const cur = qs('[name=pw_cur]', form).value;
    const neu = qs('[name=pw_new]', form).value;
    if (!cur || !neu) { toast('Fill both fields', 'warn'); return; }
    const st = getSettings();
    const ok = await verifyPassword(cur, st.admin_password_hash);
    if (!ok) { toast(t('login.invalid'), 'bad'); return; }
    setSettings({ admin_password_hash: await hashPassword(neu) });
    qs('[name=pw_cur]', form).value = '';
    qs('[name=pw_new]', form).value = '';
    toast(t('admin.password_changed'), 'good');
  };
}

/* ============================================================ 404 fallback */
function viewNotFound(root) {
  setPageTitle('404');
  root.innerHTML = `<div class="empty">404</div>`;
}
