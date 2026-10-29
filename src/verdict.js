import { worst, isIssue, STATE_LABELS } from './states.js';

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

/**
 * Combine vendor feed statuses with our own maintenance calendar and
 * announcements, and decide: is it us, or is it them?
 */
export function computeVerdict({ services, statuses, maintenance, posts, now = new Date() }) {
  const activeMaint = maintenance.filter((m) => maintenancePhase(m, now) === 'active');
  const openPosts = posts.filter(isOpenIncidentPost);

  const rows = services
    .filter((s) => s.enabled !== false)
    .map((s) => {
      const st = statuses.get(s.id) || null;
      const vendorState = st?.state || 'unknown';
      const maint = activeMaint.filter((m) => m.services.includes(s.id));
      const post = openPosts.filter((p) => p.services.includes(s.id));

      // Our own signals override what the feed says for display purposes.
      let effective = vendorState;
      let reason = null;
      if (post.length) {
        effective = worst(post.map((p) => POST_STATE[p.severity]));
        reason = { kind: 'post', title: post[0].title, id: post[0].id };
      } else if (maint.length) {
        effective = 'maintenance';
        reason = { kind: 'maintenance', title: maint[0].title, id: maint[0].id };
      }

      const ours = Boolean(post.length || maint.length) || (s.owner === 'internal' && isIssue(vendorState));
      // If IT has declared maintenance or an incident for a service, it's ours, whatever the vendor says.
      const theirs = s.owner !== 'internal' && isIssue(vendorState) && !post.length && !maint.length;

      return {
        id: s.id,
        name: s.name,
        group: s.group || '',
        owner: s.owner || 'vendor',
        provider: s.provider,
        description: s.description || '',
        statusPageUrl: s.statusPageUrl || '',
        order: s.order ?? 0,
        state: effective,
        vendorState,
        label: STATE_LABELS[effective] || effective,
        summary: st?.summary || (st ? '' : 'Waiting for first check…'),
        incidents: st?.incidents || [],
        vendorMaintenance: st?.maintenances || [],
        checkedAt: st?.checkedAt || null,
        since: st?.since || null,
        error: st?.error || null,
        lastKnown: st?.lastKnown || null,
        latencyMs: st?.latencyMs ?? null,
        reason,
        ours,
        theirs,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const them = rows.filter((r) => r.theirs);
  const us = rows.filter((r) => r.ours);
  const level = worst(rows.map((r) => r.state));
  const unknown = rows.filter((r) => r.state === 'unknown');

  // Internal incident posts not tied to a specific tracked service still count as "us".
  const generalPosts = openPosts.filter((p) => !p.services.length || !p.services.some((id) => rows.find((r) => r.id === id)));
  const generalMaint = activeMaint.filter((m) => !m.services.length || !m.services.some((id) => rows.find((r) => r.id === id)));

  let who;
  if (them.length && (us.length || generalPosts.length || generalMaint.length)) who = 'both';
  else if (them.length) who = 'them';
  else if (us.length || generalPosts.length || generalMaint.length) who = 'us';
  else who = 'none';

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
    default:
      headline = 'All clear.';
      detail = unknown.length
        ? `No known problems. ${unknown.length} feed${unknown.length === 1 ? '' : 's'} could not be read yet.`
        : rows.length
          ? `All ${rows.length} tracked service${rows.length === 1 ? '' : 's'} look operational.`
          : 'Nothing is being tracked yet. Add services in the admin page.';
  }

  return {
    who,
    level,
    headline,
    detail,
    them: names(them),
    us: names(us),
    counts: {
      total: rows.length,
      issues: rows.filter((r) => isIssue(r.state)).length,
      maintenance: rows.filter((r) => r.state === 'maintenance').length,
      unknown: unknown.length,
    },
    services: rows,
    activeMaintenance: activeMaint,
    openPosts,
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
