// Normalized service states, shared by every provider.
// Severity order is used to compute the "worst" state for the headline.
export const SEVERITY = {
  operational: 0,
  unknown: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

export const STATES = Object.keys(SEVERITY);

export const STATE_LABELS = {
  operational: 'Operational',
  maintenance: 'Under maintenance',
  degraded: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  unknown: 'Unknown',
};

export function isState(s) {
  return Object.hasOwn(SEVERITY, s);
}

export function worst(states) {
  let w = 'operational';
  for (const s of states) {
    if (isState(s) && SEVERITY[s] > SEVERITY[w]) w = s;
  }
  return w;
}

/** A state that someone asking "is X down?" would care about. */
export function isIssue(state) {
  return SEVERITY[state] >= SEVERITY.degraded;
}
