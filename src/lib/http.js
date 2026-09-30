export function ok(res, data = {}) {
  return res.json({ success: true, data });
}

export function fail(res, message, code = 400) {
  return res.status(code).json({ success: false, error: message });
}

/** Read a scalar value from query string or JSON body (mirrors PHP sval()). */
export function q(req, key, def = null) {
  if (req.query && req.query[key] !== undefined && req.query[key] !== null) {
    const v = req.query[key];
    return Array.isArray(v) ? String(v[0]) : String(v);
  }
  if (req.body && req.body[key] !== undefined && req.body[key] !== null) {
    const v = req.body[key];
    return typeof v === 'object' ? v : String(v);
  }
  return def;
}

export function qi(req, key, def = 0) {
  const v = q(req, key, null);
  if (v === null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

export function bval(req, key, def = null) {
  if (req.body && req.body[key] !== undefined) return req.body[key];
  return def;
}
