/* ======================================================================
   charts.js — dependency-free SVG charts (line, grouped bar, sparkline)
   ====================================================================== */

let chartSeq = 0;
const nextChartId = () => 'c' + (++chartSeq);

function chartEmpty(w, h, label) {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="currentColor" opacity=".5">${esc(label)}</text>
  </svg>`;
}

/**
 * data: [{ x, y, label, shortLabel, extra }]
 * opts: { emptyLabel, tooltip: fn(item) -> html }
 */
function lineChart(data, opts = {}) {
  const W = 600, H = 280, P = 36;
  if (!data || !data.length) return chartEmpty(W, H, opts.emptyLabel || '—');

  const gid = nextChartId();
  const max = Math.max(1, ...data.map((d) => d.y));
  const stepX = (W - P * 2) / Math.max(1, data.length - 1);
  const yScale = (v) => H - P - (v / max) * (H - P * 2);
  const xScale = (i) => P + i * stepX;

  let dStr = '';
  data.forEach((p, i) => {
    dStr += `${i ? 'L' : 'M'}${xScale(i).toFixed(1)},${yScale(p.y).toFixed(1)} `;
  });

  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  let grid = '';
  for (let g = 0; g < 5; g++) {
    const y = P + (g * (H - P * 2)) / 4;
    grid += `<line x1="${P}" x2="${W - P}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".08"/>
      <text x="6" y="${y + 3}" font-size="10" fill="currentColor" opacity=".6">${formatMoney(Math.round(max - g * (max / 4)))}</text>`;
  }

  let labels = '';
  data.forEach((p, i) => {
    if (i % labelStep === 0 || i === data.length - 1) {
      labels += `<text x="${xScale(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${esc(p.shortLabel || p.label || '')}</text>`;
    }
  });

  let dots = '';
  data.forEach((p, i) => {
    dots += `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(p.y).toFixed(1)}" r="4"
      fill="var(--primary-2)" stroke="var(--bg-elev)" stroke-width="2" style="cursor:pointer"
      data-chart-tip="${esc(typeof opts.tooltip === 'function' ? opts.tooltip(p) : (p.label || ''))}"></circle>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--primary-2)"/>
      <stop offset="100%" stop-color="var(--primary-2)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${dStr}L${xScale(data.length - 1).toFixed(1)},${H - P} L${xScale(0).toFixed(1)},${H - P} Z" fill="url(#${gid})" opacity=".18"/>
    <path d="${dStr}" fill="none" stroke="var(--primary-2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${labels}
    ${dots}
  </svg>`;
}

/** items: [{ label, value, color }] */
function groupedBar(items, opts = {}) {
  const W = 600, H = 220, P = 50;
  if (!items || !items.length) return chartEmpty(W, H, opts.emptyLabel || '—');

  const max = Math.max(1, ...items.map((i) => i.value));
  const gap = (W - P * 2) / items.length;
  const bw = gap * 0.55;

  let grid = '';
  for (let g = 0; g < 5; g++) {
    const y = P + (g * (H - P * 2)) / 4;
    grid += `<line x1="${P}" x2="${W - P}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".08"/>
      <text x="6" y="${y + 3}" font-size="10" fill="currentColor" opacity=".6">${formatMoney(Math.round(max - g * (max / 4)))}</text>`;
  }

  let bars = '';
  items.forEach((it, i) => {
    const x = P + i * gap + (gap - bw) / 2;
    const h = Math.max(2, (it.value / max) * (H - P * 2));
    const y = H - P - h;
    bars += `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${it.color || 'var(--primary-2)'}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".8">${esc(String(it.label))}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${formatMoney(it.value)}</text>
    </g>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${bars}</svg>`;
}

function sparkline(values, color = 'var(--primary-2)') {
  const W = 120, H = 36;
  if (!values || !values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? W / (values.length - 1) : W;
  let d = '';
  values.forEach((v, i) => {
    const x = i * step;
    const y = H - 4 - ((v - min) / range) * (H - 8);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Animate integer count-ups inside a container (elements with data-count). */
function bindCountUps(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.getAttribute('data-count')) || 0;
    const start = performance.now();
    const dur = 700;
    const tick = (nowTs) => {
      const p = Math.min(1, (nowTs - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  });
}

/* Chart hover tooltips (single shared element) */
function bindChartTooltips(root) {
  const tip = document.getElementById('tooltip');
  if (!tip) return;
  root.querySelectorAll('[data-chart-tip]').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      tip.innerHTML = el.getAttribute('data-chart-tip') || '';
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      tip.classList.add('show');
    });
    el.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}
