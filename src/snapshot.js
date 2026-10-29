import { computeVerdict, maintenancePhase } from './verdict.js';

const UPCOMING_DAYS = 14;

/** Everything the public page needs, in one object. */
export function buildSnapshot({ store, poller, config, now = new Date() }) {
  const services = store.list('services');
  const maintenance = store.list('maintenance');
  const posts = store.list('posts');

  const verdict = computeVerdict({ services, statuses: poller.statuses, maintenance, posts, now });

  const nameOf = Object.fromEntries(services.map((s) => [s.id, s.name]));
  const withNames = (x) => ({ ...x, serviceNames: (x.services || []).map((id) => nameOf[id]).filter(Boolean) });

  const horizon = now.getTime() + UPCOMING_DAYS * 86400 * 1000;
  const maint = maintenance.map((m) => ({ ...withNames(m), phase: maintenancePhase(m, now) }));
  const byStart = (a, b) => new Date(a.startsAt) - new Date(b.startsAt);

  const vendorIncidents = verdict.services.flatMap((s) =>
    s.incidents.map((i) => ({ ...i, serviceId: s.id, serviceName: s.name, owner: s.owner })),
  );
  const vendorMaintenance = verdict.services.flatMap((s) =>
    s.vendorMaintenance.map((m) => ({ ...m, serviceId: s.id, serviceName: s.name })),
  );

  const sortedPosts = [...posts]
    .map(withNames)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  return {
    generatedAt: now.toISOString(),
    site: { name: config.siteName, org: config.orgName, pollIntervalSeconds: config.pollIntervalSeconds },
    verdict: {
      who: verdict.who,
      level: verdict.level,
      headline: verdict.headline,
      detail: verdict.detail,
      them: verdict.them,
      us: verdict.us,
      counts: verdict.counts,
    },
    services: verdict.services,
    incidents: vendorIncidents,
    maintenance: {
      active: maint.filter((m) => m.phase === 'active').sort(byStart),
      upcoming: maint.filter((m) => m.phase === 'upcoming' && new Date(m.startsAt).getTime() <= horizon).sort(byStart),
      vendor: vendorMaintenance,
    },
    posts: {
      open: sortedPosts.filter((p) => !p.resolved),
      recent: sortedPosts.filter((p) => p.resolved).slice(0, 10),
    },
  };
}

const ICON = {
  operational: '✅',
  maintenance: '🔧',
  degraded: '⚠️',
  partial_outage: '🟠',
  major_outage: '🔴',
  unknown: '❔',
};

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Plain-text brief, suitable for pasting into chat. */
export function renderBrief(snap, { filter = '' } = {}) {
  const q = filter.trim().toLowerCase();
  const lines = [];
  lines.push(`${snap.site.name} — ${fmt(snap.generatedAt)}`);
  if (!q) {
    lines.push(`${ICON[snap.verdict.level]} ${snap.verdict.headline} ${snap.verdict.detail}`);
    lines.push('');
  }
  const services = q ? snap.services.filter((s) => s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)) : snap.services;
  if (q && !services.length) {
    lines.push(`Nothing tracked matches "${filter}". Tracked: ${snap.services.map((s) => s.name).join(', ') || 'nothing yet'}.`);
    return lines.join('\n');
  }
  for (const s of services) {
    let line = `${ICON[s.state] || '❔'} ${s.name} — ${s.label}`;
    if (s.reason) line += ` (${s.reason.kind === 'maintenance' ? 'our maintenance' : 'our incident'}: ${s.reason.title})`;
    else if (s.summary && s.state !== 'operational') line += ` — ${s.summary}`;
    lines.push(line);
    for (const i of s.incidents.filter((x) => x.title !== s.summary).slice(0, 3)) lines.push(`    • ${i.title}${i.url ? ` ${i.url}` : ''}`);
  }
  if (!q) {
    if (snap.maintenance.active.length) {
      lines.push('', 'Maintenance in progress:');
      for (const m of snap.maintenance.active) lines.push(`  🔧 ${m.title} (until ${fmt(m.endsAt)})`);
    }
    if (snap.maintenance.upcoming.length) {
      lines.push('', 'Upcoming maintenance:');
      for (const m of snap.maintenance.upcoming) lines.push(`  📅 ${fmt(m.startsAt)} — ${m.title}`);
    }
    if (snap.posts.open.length) {
      lines.push('', `From ${snap.site.org}:`);
      for (const p of snap.posts.open) lines.push(`  ${p.severity === 'critical' ? '🔴' : p.severity === 'warning' ? '⚠️' : 'ℹ️'} ${p.title}`);
    }
  }
  return lines.join('\n');
}
