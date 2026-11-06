import { worst, isIssue, STATE_LABELS } from './states.js';
import { observedStatus } from './freshness.js';

const POST_STATE = { warning: 'degraded', critical: 'major_outage' };

export function maintenancePhase(m, now) {
  if (m.status === 'cancelled') return 'cancelled';
  if (m.status === 'completed') return 'completed';
  const start = new Date(m.startsAt).getTime();
  const end = m.endsAt ? new Date(m.endsAt).getTime() : start + 3600 * 1000;
  const t = now.getTime();
  if (m.status === 'in_progress') return t > end + 24 * 3600 * 1000 ? 'completed' : 'active';
  if (t < start) return 'upcoming';
  if (t <= end) return 'active';
  return 'completed';
}

export function isOpenIncidentPost(p) {
  return !p.resolved && (p.severity === 'warning' || p.severity === 'critical');
}

/** Combine independent internal/external evidence without hiding monitoring gaps. */
export function computeVerdict({ services, statuses, maintenance, posts, now = new Date(), staleAfterSeconds = 180 }) {
  const activeMaint = maintenance.filter((m) => maintenancePhase(m, now) === 'active');
  const openPosts = posts.filter(isOpenIncidentPost);
  const rows = services.filter((s) => s.enabled !== false).map((s) => {
    const st = observedStatus(statuses.get(s.id), now, staleAfterSeconds);
    const vendorState = st.state;
    const maint = activeMaint.filter((m) => m.services.includes(s.id));
    const post = openPosts.filter((p) => p.services.includes(s.id));
    let effective = vendorState;
    let reason = null;
    if (post.length) {
      effective = worst([vendorState, ...post.map((p) => POST_STATE[p.severity])]);
      reason = { kind: 'post', title: post[0].title, id: post[0].id };
    } else if (maint.length) {
      effective = worst([vendorState, 'maintenance']);
      reason = { kind: 'maintenance', title: maint[0].title, id: maint[0].id };
    }
    const ours = Boolean(post.length || maint.length) || (s.owner === 'internal' && isIssue(vendorState));
    // An internal announcement cannot erase independent, current vendor evidence.
    const theirs = s.owner !== 'internal' && isIssue(vendorState);
    return {
      id: s.id, name: s.name, group: s.group || '', owner: s.owner || 'vendor', provider: s.provider,
      description: s.description || '', statusPageUrl: s.statusPageUrl || '', order: s.order ?? 0,
      state: effective, vendorState,
      label: effective === 'unknown' && st.freshness === 'stale' ? 'Stale data' : STATE_LABELS[effective] || effective,
      summary: st.summary, incidents: st.incidents, vendorMaintenance: st.maintenances,
      checkedAt: st.checkedAt, since: st.since, error: st.error || null, errorCode: st.errorCode || null,
      lastKnown: st.lastKnown, lastSuccessfulAt: st.lastSuccessfulAt,
      freshness: st.freshness, ageSeconds: st.ageSeconds, expiresAt: st.expiresAt,
      latencyMs: st.latencyMs ?? null, reason, ours, theirs,
    };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const them = rows.filter((r) => r.theirs);
  const us = rows.filter((r) => r.ours);
  // Count missing monitoring evidence even when IT has declared an incident.
  const unknown = rows.filter((r) => r.freshness !== 'fresh');
  const generalPosts = openPosts.filter((p) => !p.services.length || !p.services.some((id) => rows.some((r) => r.id === id)));
  const generalMaint = activeMaint.filter((m) => !m.services.length || !m.services.some((id) => rows.some((r) => r.id === id)));
  let level = worst([...rows.map((r) => r.state), ...generalPosts.map((p) => POST_STATE[p.severity]), ...generalMaint.map(() => 'maintenance')]);
  let who;
  if (them.length && (us.length || generalPosts.length || generalMaint.length)) who = 'both';
  else if (them.length) who = 'them';
  else if (us.length || generalPosts.length || generalMaint.length) who = 'us';
  else if (!rows.length || unknown.length) who = 'unknown';
  else if (rows.some((r) => r.state === 'maintenance')) who = 'maintenance';
  else who = 'none';
  if (who === 'unknown') level = 'unknown';

  const names = (list) => list.map((r) => r.name);
  let headline;
  let detail;
  switch (who) {
    case 'them':
      headline = "It's them.";
      detail = `${joinNames(names(them))} ${them.length === 1 ? 'is' : 'are'} having problems on the vendor side.`;
      break;
    case 'us':
      headline = "It's us.";
      detail = describeUs(us, generalPosts, generalMaint);
      break;
    case 'both':
      headline = "It's both.";
      detail = `${joinNames(names(them))} ${them.length === 1 ? 'has' : 'have'} vendor-side problems. ${describeUs(us, generalPosts, generalMaint)}`;
      break;
    case 'unknown':
      headline = rows.length ? 'Status uncertain.' : 'No services configured.';
      detail = rows.length
        ? `Current health is unverified: ${unknown.length} service${unknown.length === 1 ? '' : 's'} ${unknown.length === 1 ? 'has' : 'have'} unknown status. Review feed errors and check timestamps.`
        : 'Nothing is being tracked yet. Add services in the admin page.';
      break;
    case 'maintenance': {
      headline = 'Maintenance reported.';
      const affected = rows.filter((r) => r.state === 'maintenance');
      detail = `${joinNames(names(affected))} ${affected.length === 1 ? 'is' : 'are'} under maintenance.`;
      break;
    }
    default:
      headline = 'All clear.';
      detail = `All ${rows.length} tracked service${rows.length === 1 ? '' : 's'} have current operational reports.`;
  }
  if (unknown.length && who !== 'unknown') detail += ` Monitoring coverage is incomplete for ${unknown.length} service${unknown.length === 1 ? '' : 's'}.`;
  return {
    who, level, headline, detail, them: names(them), us: names(us),
    counts: {
      total: rows.length, issues: rows.filter((r) => isIssue(r.state)).length,
      maintenance: rows.filter((r) => r.state === 'maintenance').length,
      unknown: unknown.length, stale: rows.filter((r) => r.freshness === 'stale').length,
    },
    services: rows, activeMaintenance: activeMaint, openPosts,
  };
}

function describeUs(us, generalPosts, generalMaint) {
  const parts = [];
  const maint = us.filter((r) => r.reason?.kind === 'maintenance');
  const inc = us.filter((r) => r.reason?.kind !== 'maintenance');
  if (inc.length) parts.push(`${joinNames(inc.map((r) => r.name))} ${inc.length === 1 ? 'has' : 'have'} an internal issue.`);
  if (maint.length) parts.push(`${joinNames(maint.map((r) => r.name))} ${maint.length === 1 ? 'is' : 'are'} under scheduled maintenance.`);
  for (const p of generalPosts) parts.push(`Open incident: ${p.title}.`);
  for (const m of generalMaint) parts.push(`Maintenance in progress: ${m.title}.`);
  return parts.join(' ');
}

export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
