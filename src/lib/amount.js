const MM_DIGIT_MAP = {
  '၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4',
  '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const EN_TO_MM = {
  '0': '၀', '1': '၁', '2': '၂', '3': '၃', '4': '၄',
  '5': '၅', '6': '၆', '7': '၇', '8': '၈', '9': '၉',
};

export function mmToEn(s) {
  return String(s).replace(/[၀-၉०-९]/g, (c) => MM_DIGIT_MAP[c] || c);
}

export function enToMm(s) {
  return String(s).replace(/[0-9]/g, (d) => EN_TO_MM[d]);
}

/**
 * Parse a user-entered amount string into an integer kyat.
 * Supports Arabic/Myanmar digits, commas, "10k/100k/1 lakh", and
 * Myanmar unit expressions like "၁သိန်းခွဲ", "၂သိန်း ၅ထောင်".
 */
export function parseMyAmount(raw) {
  if (raw == null) return null;
  const orig = String(raw).trim();
  if (!orig) return null;
  let work = mmToEn(orig);
  work = work.replace(/ကျပ်|MMK|mmk/gi, '');

  const mmUnits = ['ကုဋေ', 'သန်း', 'သိန်း', 'သောင်း', 'ထောင်', 'ရာ', 'ခွဲ'];
  let hasMmUnit = false;
  for (const u of mmUnits) {
    if (work.includes(u)) { hasMmUnit = true; break; }
  }

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

export function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-US');
}
