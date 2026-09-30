export function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function dateAddMonth(yyyymm, delta) {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(5, 7), 10);
  let mm = m + delta;
  let yy = y;
  while (mm < 1) { mm += 12; yy--; }
  while (mm > 12) { mm -= 12; yy++; }
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

export function isMonth(v) {
  return /^\d{4}-\d{2}$/.test(String(v || ''));
}

export function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => '\\' + c);
}
