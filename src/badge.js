const COLOR = {
  operational: '#16a34a',
  maintenance: '#2563eb',
  degraded: '#d97706',
  partial_outage: '#ea580c',
  major_outage: '#dc2626',
  unknown: '#64748b',
};

const TEXT = { none: 'all clear', them: "it's them", us: "it's us", both: "it's both" };

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Flat shields.io-style badge: "status | it's them". */
export function renderBadge(snap, { label = 'status' } = {}) {
  const value = TEXT[snap.verdict.who] || 'unknown';
  const color = COLOR[snap.verdict.level] || COLOR.unknown;
  const w = (s) => Math.round(s.length * 6.4 + 12);
  const lw = w(label);
  const vw = w(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="13">${esc(label)}</text>
<text x="${lw + vw / 2}" y="14" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${lw + vw / 2}" y="13">${esc(value)}</text>
</g></svg>`;
}
