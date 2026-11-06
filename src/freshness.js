import { isState } from './states.js';

export function staleAfterSeconds({ pollIntervalSeconds = 60, fetchTimeoutMs = 10000, statusStaleAfterSeconds } = {}) {
  const automatic = Math.max(60, pollIntervalSeconds * 3, Math.ceil(fetchTimeoutMs / 1000) * 2);
  if (statusStaleAfterSeconds === undefined || statusStaleAfterSeconds === '') return automatic;
  const value = Number(statusStaleAfterSeconds);
  if (!Number.isFinite(value) || value < pollIntervalSeconds + fetchTimeoutMs / 1000 || value > 86400 * 30) {
    throw new Error('STATUS_STALE_AFTER_SECONDS must cover a poll interval plus timeout and be at most 30 days');
  }
  return value;
}

/** Derive freshness at read time; a new snapshot never refreshes an observation. */
export function observedStatus(status, now = new Date(), limitSeconds = 180) {
  const stamp = typeof status?.checkedAt === 'string' ? Date.parse(status.checkedAt) : NaN;
  const nowMs = now.getTime();
  const validTime = Number.isFinite(stamp) && stamp <= nowMs;
  const validState = isState(status?.state) && status.state !== 'unknown';
  const ageSeconds = validTime ? Math.max(0, (nowMs - stamp) / 1000) : null;
  const expiresAt = validTime ? new Date(stamp + limitSeconds * 1000).toISOString() : null;
  const freshness = !status ? 'pending' : !validTime ? 'invalid' : ageSeconds >= limitSeconds ? 'stale'
    : status.error ? 'failed' : !validState ? 'unknown' : 'fresh';
  const current = freshness === 'fresh';
  const prior = status?.lastKnown || null;
  const lastKnown = validTime && validState && !status.error
    ? { state: status.state, checkedAt: status.checkedAt, summary: status.summary || '' }
    : prior;
  const explanations = {
    pending: 'Waiting for first check.', invalid: 'Check timestamp is missing, invalid, or in the future.',
    stale: 'Monitoring data is stale. Current health is not verified.',
    failed: 'Monitoring check failed. Current health is not verified.', unknown: 'The check did not establish service health.',
  };
  return {
    ...(status || {}), state: current ? status.state : 'unknown', freshness, ageSeconds, expiresAt,
    checkedAt: validTime ? status.checkedAt : null,
    lastSuccessfulAt: current ? status.checkedAt : status?.lastSuccessfulAt || lastKnown?.checkedAt || null,
    lastKnown: current ? null : lastKnown,
    summary: current ? status.summary || '' : explanations[freshness],
    incidents: current ? status.incidents || [] : [],
    maintenances: current ? status.maintenances || [] : [],
    since: current ? status.since || null : null,
  };
}
