import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badge, externalLink, filterServices, initials, maintenancePhase, postKind, emptyState } from '../public/js/ui.js';

const service = (id, owner, state = 'operational', freshness = 'fresh') => ({ id, name: `Service ${id}`, group: 'Collaboration', description: 'Employee tools', owner, state, freshness });
const services = [service('a', 'internal'), service('b', 'vendor', 'degraded'), service('c', 'internal', 'unknown', 'stale')];

test('service search is case-insensitive and includes name, description and group', () => {
  assert.deepEqual(filterServices(services, ' SERVICE A ').map((s) => s.id), ['a']);
  assert.equal(filterServices(services, 'collab').length, 3);
  assert.equal(filterServices(services, 'employee').length, 3);
  assert.equal(filterServices(services, 'not present').length, 0);
});
test('service filters combine with search without implying unknown is healthy', () => {
  assert.deepEqual(filterServices(services, '', 'internal').map((s) => s.id), ['a', 'c']);
  assert.deepEqual(filterServices(services, '', 'vendor').map((s) => s.id), ['b']);
  assert.deepEqual(filterServices(services, '', 'attention').map((s) => s.id), ['b', 'c']);
  assert.equal(filterServices(services, '', 'attention', true).length, 3);
  assert.equal(filterServices(services, 'a', 'vendor').length, 1); // group matches, owner still applies
  assert.equal(filterServices(services, 'service a', 'vendor').length, 0);
});
test('initials use two words and preserve Unicode characters', () => {
  assert.equal(initials('Google Workspace'), 'GW');
  assert.equal(initials('  Office Wi-Fi Network  '), 'OW');
  assert.equal(initials('💻 Support'), '💻S');
  assert.equal(initials(null), '?');
});
test('status badges whitelist styling and escape untrusted labels', () => {
  const html = badge('major_outage" onclick="alert(1)', '<img src=x onerror=alert(1)>');
  assert.match(html, /status-badge unknown/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|onclick|onerror="/);
  assert.match(badge('operational'), /Operational/);
  assert.match(badge('degraded'), /aria-hidden="true"/);
});
test('external links reject executable schemes, credentials and malformed URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', '/relative', 'https://example.com/\n']) {
    assert.equal(externalLink(url, '<label>'), '&lt;label&gt;');
  }
  const html = externalLink('https://example.com/?a=1&b=2', 'Vendor status');
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /opens in a new tab/);
});
test('announcements and incidents remain separate without changing API severity', () => {
  assert.equal(postKind({ severity: 'info' }), 'announcement');
  assert.equal(postKind({ severity: 'warning' }), 'incident');
  assert.equal(postKind({ severity: 'critical' }), 'incident');
});
const now = Date.parse('2026-11-06T12:00:00Z');
const window = { startsAt: '2026-11-06T11:00:00Z', endsAt: '2026-11-06T13:00:00Z', status: 'scheduled' };
test('maintenance phases preserve inclusive end and explicit states', () => {
  assert.equal(maintenancePhase(window, now), 'active');
  assert.equal(maintenancePhase(window, Date.parse(window.endsAt)), 'active');
  assert.equal(maintenancePhase(window, Date.parse(window.endsAt) + 1), 'completed');
  assert.equal(maintenancePhase(window, Date.parse(window.startsAt) - 1), 'upcoming');
  assert.equal(maintenancePhase({ ...window, status: 'completed' }, now - 86400000), 'completed');
  assert.equal(maintenancePhase({ ...window, status: 'cancelled' }, now), 'cancelled');
});
test('maintenance missing end, in-progress expiry and invalid dates are explicit', () => {
  assert.equal(maintenancePhase({ ...window, endsAt: null }, now), 'active');
  assert.equal(maintenancePhase({ ...window, endsAt: null }, now + 1), 'completed');
  assert.equal(maintenancePhase({ ...window, status: 'in_progress' }, Date.parse(window.endsAt) + 86400000), 'active');
  assert.equal(maintenancePhase({ ...window, status: 'in_progress' }, Date.parse(window.endsAt) + 86400001), 'completed');
  assert.equal(maintenancePhase({ startsAt: 'not a date' }, now), 'unknown');
});
test('empty states cannot insert markup from titles or descriptions', () => {
  const html = emptyState('<script>bad()</script>', '<img src=x>');
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
});

const css = readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
const blocks = [css.match(/:root\s*\{([\s\S]*?)\}/)[1], css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1]];
function luminance(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3) value = [...value].map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const [i, block] of blocks.entries()) {
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})\s*;/gi)].map((m) => [m[1], m[2]]));
  for (const [fg, bg] of [['text', 'surface'], ['muted', 'surface'], ['muted', 'bg'], ['subtle', 'surface'], ['brand', 'surface'], ...['ok', 'warn', 'partial', 'major', 'maint', 'unknown'].map((s) => [s, `${s}-bg`])]) {
    test(`${i ? 'dark' : 'light'} ${fg}/${bg} tokens meet 4.5:1 normal-text contrast`, () => {
      const a = luminance(tokens[fg]), b = luminance(tokens[bg]);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${fg}/${bg}: ${ratio.toFixed(3)}:1`);
    });
  }
}
test('both documents have a skip link, accessible theme control and external modules', () => {
  for (const filename of ['index.html', 'admin.html']) {
    const html = readFileSync(new URL(`../public/${filename}`, import.meta.url), 'utf8');
    assert.match(html, /class="skip-link"/);
    assert.match(html, /id="theme-select"/);
    assert.match(html, /<script[^>]+src="\/js\/theme.js"/);
    assert.doesNotMatch(html, /<script\s*>/);
  }
});
test('admin tab controls and dialogs are explicitly named', () => {
  const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
  assert.match(html, /<dialog[^>]+aria-labelledby="dialog-title"/);
  assert.match(html, /<dialog[^>]+aria-labelledby="confirm-title"/);
});
