const MM_DIGIT_MAP = { '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4', '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9' };
const EN_TO_MM = { '0': '၀', '1': '၁', '2': '၂', '3': '၃', '4': '၄', '5': '၅', '6': '၆', '7': '၇', '8': '၈', '9': '၉' };

function mmToEn(s) {
  return String(s).replace(/[၀-၉]/g, (c) => MM_DIGIT_MAP[c] || c);
}

function enToMm(s) {
  return String(s).replace(/[0-9]/g, (d) => EN_TO_MM[d]);
}

function parseMyAmount(raw) {
  if (raw == null) return null;
  const orig = String(raw).trim();
  if (!orig) return null;
  let work = mmToEn(orig);
  work = work.replace(/ကျပ်|MMK|mmk/gi, '');

  const mmUnits = ['ကုဋေ', 'သန်း', 'သိန်း', 'သောင်း', 'ထောင်', 'ရာ', 'ခွဲ'];
  let hasMmUnit = false;
  for (const u of mmUnits) if (work.includes(u)) { hasMmUnit = true; break; }

  const m1 = work.match(/^(-?\d+(?:\.\d+)?)\s*k$/i);
  if (m1) return Math.round(parseFloat(m1[1]) * 1000);
  const m2 = work.match(/^(-?\d+(?:\.\d+)?)\s*(?:lakh|la)$/i);
  if (m2) return Math.round(parseFloat(m2[1]) * 100000);
  const m3 = work.match(/^(-?\d+(?:\.\d+)?)\s*(?:m|million)$/i);
  if (m3) return Math.round(parseFloat(m3[1]) * 1000000);

  if (!hasMmUnit) {
    const digits = work.replace(/[^\d.\-]/g, '');
    if (digits && /^-?\d+(?:\.\d+)?$/.test(digits)) return Math.round(parseFloat(digits));
    return null;
  }

  const units = { 'ကုဋေ': 1e12, 'သန်း': 1e6, 'သိန်း': 1e5, 'သောင်း': 1e4, 'ထောင်': 1e3, 'ရာ': 100 };
  let norm = work.replace(/[,\s၊]+/g, ' ');
  for (const u of Object.keys(units)) norm = norm.split(u).join(' ' + u + ' ');
  norm = norm.split('ခွဲ').join(' ခွဲ ');
  norm = norm.replace(/\s+/g, ' ').trim();
  const tokens = norm.length ? norm.split(/\s+/) : [];
  if (!tokens.length) return null;

  let total = 0;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '' || tok === '-') { i++; continue; }
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      const num = parseFloat(tok);
      let unit = 1;
      if (i + 1 < tokens.length && Object.prototype.hasOwnProperty.call(units, tokens[i + 1])) {
        unit = units[tokens[i + 1]];
        i += 2;
      } else {
        i++;
      }
      const half = i < tokens.length && tokens[i] === 'ခွဲ';
      if (half) { i++; total += num * unit + unit * 0.5; } else { total += num * unit; }
    } else if (Object.prototype.hasOwnProperty.call(units, tok)) {
      const unit = units[tok];
      i++;
      const half = i < tokens.length && tokens[i] === 'ခွဲ';
      if (half) { i++; total += unit + unit * 0.5; } else { total += unit; }
    } else {
      i++;
    }
  }
  return total > 0 ? Math.round(total) : null;
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function formatMoneyMm(n) {
  return enToMm(formatMoney(n));
}

function formatMmUnits(n, withKyat = true) {
  n = Math.max(0, Math.floor(n || 0));
  const suffix = withKyat ? ' ကျပ်' : '';
  if (n === 0) return '၀' + suffix;
  const kyat = n % 1000;
  let x = Math.floor(n / 1000);
  const thou = x % 100;
  x = Math.floor(x / 100);
  const lakh = x % 100;
  x = Math.floor(x / 100);
  const mil = x % 100;
  x = Math.floor(x / 100);
  const bil = x;
  const parts = [];
  const push = (numEn, unit) => {
    if (parseInt(numEn, 10) > 0) parts.push(enToMm(numEn) + (unit !== '' ? ' ' + unit : ''));
  };
  push(String(bil), 'ကုဋေ');
  push(String(mil), 'သန်း');
  if (lakh > 0) {
    const l = lakh, t = thou, k = kyat;
    if (l >= 1 && t === 50 && k === 0) parts.push(enToMm(String(l)) + ' သိန်းခွဲ');
    else {
      push(String(l), 'သိန်း');
      let rem = t * 1000 + k;
      if (rem >= 10000) { push(String(Math.floor(rem / 10000)), 'သောင်း'); rem = rem % 10000; }
      if (rem >= 1000) { push(String(Math.floor(rem / 1000)), 'ထောင်'); rem = rem % 1000; }
      if (rem >= 100) { push(String(Math.floor(rem / 100)), 'ရာ'); rem = rem % 100; }
      if (rem > 0) push(String(rem), '');
    }
  } else {
    let rem = thou * 1000 + kyat;
    if (rem >= 10000) { push(String(Math.floor(rem / 10000)), 'သောင်း'); rem = rem % 10000; }
    if (rem >= 1000) { push(String(Math.floor(rem / 1000)), 'ထောင်'); rem = rem % 1000; }
    if (rem >= 100) { push(String(Math.floor(rem / 100)), 'ရာ'); rem = rem % 100; }
    if (rem > 0) push(String(rem), '');
  }
  return (parts.length ? parts.join(' ') : '၀') + suffix;
}

function formatAmount(n, mode = 'both') {
  if (n == null || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  switch (mode) {
    case 'exact':
      return { en: formatMoney(v), mm: formatMoneyMm(v) };
    case 'units':
      return { en: '', mm: formatMmUnits(v) };
    case 'auto':
      if (v >= 100000) return { en: formatMoney(v), mm: formatMmUnits(v) };
      return { en: formatMoney(v), mm: formatMoneyMm(v) };
    case 'both':
    default:
      return { en: formatMoney(v) + ' MMK', mm: formatMmUnits(v) };
  }
}
