/** Use elapsed time since receipt, not the browser's wall clock, to age server data. */
export function snapshotHealth(snapshot, elapsedMs, failed = false) {
  if (failed) return 'offline';
  if (!snapshot) return 'loading';
  const generated = Date.parse(snapshot.generatedAt);
  const configured = Number(snapshot.site?.staleAfterSeconds) * 1000;
  if (!Number.isFinite(generated) || !Number.isFinite(configured) || configured <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 'stale';
  let validFor = configured;
  for (const service of snapshot.services || []) {
    if (service.freshness !== 'fresh') continue;
    const expires = Date.parse(service.expiresAt);
    if (!Number.isFinite(expires)) return 'stale';
    validFor = Math.min(validFor, expires - generated);
  }
  return elapsedMs >= validFor ? 'stale' : 'current';
}

/** Treat vendor-provided links as untrusted content, not just escaped text. */
export function safeHref(value) {
  if (typeof value !== 'string' || /[\\\s\u0000-\u001f\u007f]/u.test(value)) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
