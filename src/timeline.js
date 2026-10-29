import { SEVERITY } from './states.js';

function worstIncludingUnknown(states) {
  let w = null;
  for (const s of states) {
    if (!Object.hasOwn(SEVERITY, s)) continue;
    if (w === null || w === 'unknown' || SEVERITY[s] > SEVERITY[w]) w = s;
  }
  return w;
}

/**
 * Turn a list of state-change events into fixed-width slots for a history bar.
 * Each slot holds the worst state seen during it, or null when nothing is known.
 */
export function buildTimeline(events, now = new Date(), { hours = 24, slots = 48 } = {}) {
  const to = now.getTime();
  const from = to - hours * 3600e3;
  const step = (to - from) / slots;
  const sorted = events
    .map((e) => ({ state: e.state, t: new Date(e.at).getTime() }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);

  const out = [];
  let idx = 0; // first event not yet at-or-before the slot start
  let current = null;
  for (let k = 0; k < slots; k++) {
    const s = from + k * step;
    const e = s + step;
    while (idx < sorted.length && sorted[idx].t <= s) current = sorted[idx++].state;
    const states = current ? [current] : [];
    for (let j = idx; j < sorted.length && sorted[j].t < e; j++) states.push(sorted[j].state);
    out.push(states.length ? worstIncludingUnknown(states) : null);
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), slotMinutes: Math.round(step / 60000), slots: out };
}

/** Percentage of known time in the window spent without an issue (maintenance counts as fine). */
export function availability(timeline) {
  const known = timeline.slots.filter((s) => s !== null && s !== 'unknown');
  if (!known.length) return null;
  const good = known.filter((s) => SEVERITY[s] < SEVERITY.degraded).length;
  return Math.round((good / known.length) * 1000) / 10;
}
