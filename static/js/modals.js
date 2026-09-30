/* ======================================================================
   modals.js — form dialogs (payment, member, bulk, expense, loan, repay)
   ====================================================================== */

function footRow(formId, saveLabel) {
  return `<button type="button" class="ghost-btn" data-cancel>${esc(t('action.cancel'))}</button>
    <button type="submit" form="${formId}" class="primary-btn">${esc(saveLabel || t('action.save'))}</button>`;
}

function field(label, inner) {
  return `<label class="field"><span>${esc(label)}</span>${inner}</label>`;
}

function wireCancel(wrap, close) {
  const btn = qs('[data-cancel]', wrap);
  if (btn) btn.onclick = close;
}

/* ================================================================ payment */
function openPaymentModal(prefill = {}) {
  if (!guard()) return;
  const members = membersList({ active: '' });
  const monthVal = String(prefill.month || STATE.month);
  const amountVal = prefill.amount != null ? String(prefill.amount) : formatMoney(10000);
  const mid = prefill.member_id || (members[0] && members[0].id) || '';

  const opts = members.map((m) => `<option value="${m.id}"${String(m.id) === String(mid) ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  const body = `<form id="payment-form">
      <div class="grid-2">
        ${field(t('field.member'), `<select required name="member">${opts}</select>`)}
        ${field(t('field.month'), `<input type="month" required name="month" value="${esc(monthVal)}" />`)}
      </div>
      ${field(t('field.amount'), `<input type="text" inputmode="text" autocomplete="off" placeholder="၁သောင်း / 10,000 / 10k" required name="amount" value="${esc(amountVal)}" /><div data-preview></div>`)}
      <div class="grid-2">
        ${field(t('field.paid_at'), `<input type="date" required name="paid_at" value="${esc(prefill.paid_at || todayISO())}" />`)}
        ${field(t('field.note'), `<input type="text" maxlength="200" name="note" value="${esc(prefill.note || '')}" />`)}
      </div>
    </form>`;

  openModal({
    title: t('payment.title'),
    body,
    footer: footRow('payment-form'),
    onMount(wrap, close) {
      wireCancel(wrap, close);
      bindPreview(qs('[name=amount]', wrap), qs('[data-preview]', wrap));
      qs('#payment-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        const parsed = parseMyAmount(qs('[name=amount]', wrap).value);
        if (!prefill.unpaid && (parsed == null || parsed <= 0)) { toast(t('amount.invalid'), 'warn'); return; }
        try {
          savePayment({
            id: prefill.id || 0,
            member_id: parseInt(qs('[name=member]', wrap).value, 10),
            month: qs('[name=month]', wrap).value,
            amount: qs('[name=amount]', wrap).value,
            paid_at: qs('[name=paid_at]', wrap).value,
            note: qs('[name=note]', wrap).value,
            unpaid: !!prefill.unpaid,
          });
          toast(t('payment.saved'), 'good');
          close();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}

/* ================================================================ member */
function openMemberModal(member = null) {
  if (!guard()) return;
  const s = getSettings();
  const fallback = parseInt(s.default_amount || '10000', 10);
  const amountVal = member ? String(member.monthly_amount) : formatMoney(fallback);

  const body = `<form id="member-form">
      <div class="grid-2">
        ${field(t('field.name'), `<input type="text" required maxlength="80" name="name" value="${esc(member ? member.name : '')}" />`)}
        ${field(t('field.monthly_amount'), `<input type="text" inputmode="text" required name="amount" value="${esc(amountVal)}" /><div data-preview></div>`)}
      </div>
      ${field(t('field.note'), `<input type="text" maxlength="200" name="note" value="${esc(member && member.note ? member.note : '')}" />`)}
      <label class="checkbox">
        <input type="checkbox" name="active" ${!member || member.active ? 'checked' : ''} />
        <span>${esc(t('field.active'))}</span>
      </label>
    </form>`;

  openModal({
    title: t('member.title'),
    body,
    footer: footRow('member-form'),
    onMount(wrap, close) {
      wireCancel(wrap, close);
      bindPreview(qs('[name=amount]', wrap), qs('[data-preview]', wrap));
      qs('#member-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          saveMember({
            id: member ? member.id : 0,
            name: qs('[name=name]', wrap).value,
            monthly_amount: qs('[name=amount]', wrap).value,
            active: qs('[name=active]', wrap).checked ? 1 : 0,
            note: qs('[name=note]', wrap).value,
          });
          toast(member ? t('member.updated') : t('member.added'), 'good');
          close();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}

/* ================================================================== bulk */
function openBulkModal() {
  if (!guard()) return;
  const members = membersList({ active: '1' });

  const list = members.map((m) => `
    <label>
      <input type="checkbox" name="mid" value="${m.id}" />
      <span style="flex:1">${esc(m.name)}</span>
      <span class="muted">${amtHtml(m.monthly_amount)}</span>
    </label>`).join('');

  const body = `<form id="bulk-form">
      <div class="grid-2">
        ${field(t('field.month'), `<input type="month" required name="month" value="${esc(STATE.month)}" />`)}
        ${field(t('field.paid_at'), `<input type="date" required name="paid_at" value="${todayISO()}" />`)}
      </div>
      ${field(t('bulk.amount_label'), `<input type="text" inputmode="text" placeholder="optional" name="amount" value="" /><div data-preview></div>`)}
      <div class="bulk-list">${list}</div>
    </form>`;

  openModal({
    title: t('bulk.title'),
    body,
    footer: `<span class="muted" data-count>0 ${esc(STATE.lang === 'mm' ? 'ယောက်' : 'selected')}</span>${footRow('bulk-form', t('bulk.confirm'))}`,
    onMount(wrap, close) {
      wireCancel(wrap, close);
      bindPreview(qs('[name=amount]', wrap), qs('[data-preview]', wrap));
      const countEl = qs('[data-count]', wrap);
      const boxes = qsa('input[name=mid]', wrap);
      const sync = () => {
        const n = boxes.filter((b) => b.checked).length;
        countEl.textContent = `${n} ${STATE.lang === 'mm' ? 'ယောက်' : 'selected'}`;
      };
      boxes.forEach((b) => b.addEventListener('change', sync));

      qs('#bulk-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        const ids = boxes.filter((b) => b.checked).map((b) => parseInt(b.value, 10));
        if (!ids.length) { toast('Select at least one', 'warn'); return; }
        const amount = qs('[name=amount]', wrap).value;
        if (amount && parseMyAmount(amount) == null) { toast(t('amount.invalid'), 'warn'); return; }
        try {
          const res = bulkPay({
            month: qs('[name=month]', wrap).value,
            paid_at: qs('[name=paid_at]', wrap).value,
            amount,
            member_ids: ids,
          });
          toast(t('bulk.saved').replace('{n}', res.saved), 'good');
          close();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}

/* ================================================================ expense */
function openSpendModal(available = 0) {
  if (!guard()) return;
  const body = `<form id="spend-form">
      <div class="grid-2">
        ${field(t('spend.amount'), `<input type="text" inputmode="text" autocomplete="off" placeholder="၁သိန်း / 100,000" required name="amount" value="" /><div data-preview></div>`)}
        ${field(t('spend.date'), `<input type="date" required name="spent_at" value="${todayISO()}" />`)}
      </div>
      ${field(t('spend.reason'), `<input type="text" required maxlength="200" name="reason" placeholder="e.g. office supplies, party fund" value="" />`)}
      ${field(t('field.note'), `<input type="text" maxlength="200" name="note" value="" />`)}
      <div class="balance-hint" data-hint hidden></div>
    </form>`;

  openModal({
    title: t('spend.title'),
    body,
    footer: footRow('spend-form', t('spend.confirm')),
    onMount(wrap, close) {
      wireCancel(wrap, close);
      const input = qs('[name=amount]', wrap);
      const hint = qs('[data-hint]', wrap);
      bindPreview(input, qs('[data-preview]', wrap));
      const updateHint = () => {
        const parsed = parseMyAmount(input.value);
        if (parsed == null) { hint.hidden = true; return; }
        const remaining = (available || 0) - parsed;
        hint.hidden = false;
        if (remaining < 0) {
          hint.className = 'balance-hint err';
          hint.textContent = `${t('spend.insufficient')} (${amtTextEn(Math.max(0, remaining))})`;
        } else {
          hint.className = 'balance-hint ok';
          hint.textContent = `${t('spend.balance')}: ${amtTextEn(available)} → ${amtTextEn(remaining)}`;
        }
      };
      input.addEventListener('input', updateHint);
      updateHint();

      qs('#spend-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        const parsed = parseMyAmount(input.value);
        if (parsed == null || parsed <= 0) { toast(t('amount.invalid'), 'warn'); return; }
        if ((available || 0) - parsed < 0) { toast(t('spend.insufficient'), 'warn'); return; }
        try {
          saveExpense({
            amount: input.value,
            spent_at: qs('[name=spent_at]', wrap).value,
            reason: qs('[name=reason]', wrap).value,
            note: qs('[name=note]', wrap).value,
          });
          toast(t('spend.saved'), 'good');
          close();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}

/* ================================================================== loan */
function openLoanModal(loan = null, prefill = {}) {
  if (!guard()) return;
  const members = membersList({ active: '' });
  const mid = loan ? loan.member_id : (prefill.member_id || (members[0] && members[0].id) || '');
  const opts = members.map((m) => `<option value="${m.id}"${String(m.id) === String(mid) ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  const body = `<form id="loan-form">
      ${field(t('field.member'), `<select required name="member">${opts}</select>`)}
      <div class="grid-2">
        ${field(t('loans.principal'), `<input type="text" inputmode="text" autocomplete="off" placeholder="၁သိန်း / 100,000" required name="amount" value="${esc(loan ? String(loan.amount) : '')}" /><div data-preview></div>`)}
        ${field(t('loans.interest'), `<input type="text" inputmode="text" autocomplete="off" placeholder="0 / 5000" name="interest" value="${esc(loan && loan.interest ? String(loan.interest) : '')}" /><div data-preview2></div>`)}
      </div>
      <div class="grid-2">
        ${field(t('loans.borrowed_at'), `<input type="date" required name="borrowed_at" value="${esc(loan ? loan.borrowed_at : (prefill.borrowed_at || todayISO()))}" />`)}
        ${field(t('loans.due_date'), `<input type="date" name="due_date" value="${esc(loan && loan.due_date ? loan.due_date : '')}" />`)}
      </div>
      ${field(t('field.note'), `<input type="text" maxlength="200" name="note" value="${esc(loan && loan.note ? loan.note : '')}" />`)}
      <div class="balance-hint ok" data-hint hidden></div>
    </form>`;

  openModal({
    title: loan ? t('action.edit') : t('loan.title'),
    body,
    footer: footRow('loan-form'),
    onMount(wrap, close) {
      wireCancel(wrap, close);
      const amountInput = qs('[name=amount]', wrap);
      const interestInput = qs('[name=interest]', wrap);
      const hint = qs('[data-hint]', wrap);
      bindPreview(amountInput, qs('[data-preview]', wrap));
      bindPreview(interestInput, qs('[data-preview2]', wrap));
      const updateHint = () => {
        const p = parseMyAmount(amountInput.value);
        const pi = interestInput.value.trim() ? parseMyAmount(interestInput.value) : 0;
        if (p == null || p <= 0) { hint.hidden = true; return; }
        hint.hidden = false;
        hint.textContent = `${t('loans.total_due')}: ${amtTextEn((p || 0) + (pi || 0))} — ${amtText((p || 0) + (pi || 0))}`;
      };
      amountInput.addEventListener('input', updateHint);
      interestInput.addEventListener('input', updateHint);
      updateHint();

      qs('#loan-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          saveLoan({
            id: loan ? loan.id : 0,
            member_id: parseInt(qs('[name=member]', wrap).value, 10),
            amount: amountInput.value,
            interest: interestInput.value,
            borrowed_at: qs('[name=borrowed_at]', wrap).value,
            due_date: qs('[name=due_date]', wrap).value,
            note: qs('[name=note]', wrap).value,
          });
          toast(t('loans.saved'), 'good');
          close();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}

/* ============================================================ repayment */
function openLoanPaymentModal(loanId) {
  if (!guard()) return;
  const live = () => {
    const row = loansList({}).items.find((l) => l.id === Number(loanId));
    return row || null;
  };
  let loan = live();
  if (!loan) { toast('Not found', 'bad'); return; }

  const hint = () => `<div class="balance-hint ok" style="margin-bottom:10px">
      <strong>${esc(loan.member_name)}</strong> — ${esc(t('loans.outstanding'))}:
      ${amtTextEn(loan.outstanding)} / ${amtTextEn(loan.total_due)} — ${amtText(loan.total_due)}
    </div>`;

  const repayList = () => {
    if (!loan.payments.length) return `<div class="empty" style="margin:0">${esc(t('loan.no_repayments'))}</div>`;
    return `<div class="list">${loan.payments.map((p) => `
      <div class="list-item">
        <div class="rank">↺</div>
        <div>
          <div class="name">${esc(String(p.paid_at || '').slice(0, 10))}</div>
          <div class="meta">${esc(p.note || '')}</div>
        </div>
        <div class="amt">${amtHtml(p.amount)}</div>
        <button class="danger-btn admin-only" type="button" data-del="${p.id}">${esc(t('action.delete'))}</button>
      </div>`).join('')}</div>`;
  };

  const body = `<div data-hint>${hint()}</div>
    <form id="loan-repay-form">
      <div class="grid-2">
        ${field(t('loan.repay_amount'), `<input type="text" inputmode="text" autocomplete="off" placeholder="၁သောင်း / 10,000" required name="amount" value="${loan.outstanding > 0 ? loan.outstanding : ''}" /><div data-preview></div>`)}
        ${field(t('field.paid_at'), `<input type="date" required name="paid_at" value="${todayISO()}" />`)}
      </div>
      ${field(t('field.note'), `<input type="text" maxlength="200" name="note" value="" />`)}
      <div class="balance-hint" data-remain hidden></div>
    </form>
    <div style="margin-top:14px">
      <div class="muted" style="margin-bottom:6">${esc(t('loan.repayments'))}</div>
      <div data-list>${repayList()}</div>
    </div>`;

  openModal({
    title: t('loan.repay_title'),
    body,
    footer: footRow('loan-repay-form'),
    wide: false,
    onMount(wrap, close) {
      wireCancel(wrap, close);
      const amountInput = qs('[name=amount]', wrap);
      const remainEl = qs('[data-remain]', wrap);
      const listEl = qs('[data-list]', wrap);
      const hintEl = qs('[data-hint]', wrap);
      bindPreview(amountInput, qs('[data-preview]', wrap));

      const updateRemain = () => {
        const parsed = parseMyAmount(amountInput.value);
        if (parsed == null) { remainEl.hidden = true; return; }
        const over = parsed > loan.outstanding;
        const remaining = Math.max(0, loan.outstanding - parsed);
        remainEl.hidden = false;
        remainEl.className = 'balance-hint ' + (over ? 'err' : 'ok');
        remainEl.textContent = over
          ? `${t('loans.exceeds_outstanding')} (${amtTextEn(loan.outstanding)})`
          : `${t('loans.outstanding')}: ${amtTextEn(loan.outstanding)} → ${amtTextEn(remaining)}`;
      };
      amountInput.addEventListener('input', updateRemain);
      updateRemain();

      const rerender = () => {
        hintEl.innerHTML = hint();
        listEl.innerHTML = repayList();
        bindDeletes();
        updateRemain();
      };

      const bindDeletes = () => {
        qsa('[data-del]', listEl).forEach((btn) => {
          btn.onclick = async () => {
            if (!guard()) return;
            const yes = await confirmAsk(`${t('action.delete')}?`);
            if (!yes) return;
            try {
              deleteLoanPayment(Number(btn.getAttribute('data-del')));
              toast(t('loan.repay_deleted'), 'good');
              loan = live() || loan;
              rerender();
              refresh();
            } catch (err) { toast(err.message, 'bad'); }
          };
        });
      };
      bindDeletes();

      qs('#loan-repay-form', wrap).addEventListener('submit', async (e) => {
        e.preventDefault();
        const parsed = parseMyAmount(amountInput.value);
        if (parsed == null || parsed <= 0) { toast(t('amount.invalid'), 'warn'); return; }
        if (parsed > loan.outstanding) {
          toast(`${t('loans.exceeds_outstanding')} (${amtTextEn(loan.outstanding)})`, 'warn');
          return;
        }
        try {
          saveLoanPayment({
            loan_id: loan.id,
            amount: amountInput.value,
            paid_at: qs('[name=paid_at]', wrap).value,
            note: qs('[name=note]', wrap).value,
          });
          toast(t('loan.repay_saved'), 'good');
          loan = live() || loan;
          amountInput.value = loan.outstanding > 0 ? String(loan.outstanding) : '';
          qs('[name=note]', wrap).value = '';
          rerender();
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      });
    },
  });
}
