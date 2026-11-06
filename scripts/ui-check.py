#!/usr/bin/env python3
"""Browser regression checks and real UI screenshots with explicitly simulated API data.

Run: pip install -r scripts/requirements-ui.txt
     playwright install chromium
     python scripts/ui-check.py [--output PATH]

This tests the actual static frontend against a deterministic API fixture, not live
vendors or the Express backend. The normal npm test suite covers backend behavior.
"""
import argparse
import copy
import json
import os
import shutil
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
TOKEN = 'ui-fixture-token-not-a-secret'
CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

def iso(delta=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=delta)).isoformat().replace('+00:00', 'Z')

class Static(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == '/admin': self.path = '/admin.html'
        return super().do_GET()
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        return super().end_headers()
    def log_message(self, *args): pass

class Fixture:
    def __init__(self):
        self.mode = 'normal'
        self.calls = []
        self.next_id = 20
        self.fail_write = False
        self.providers = [
            dict(id='statuspage', label='Statuspage', description='Read a Statuspage-compatible vendor feed.', defaultOwner='vendor', fields=[dict(key='baseUrl', label='Status page URL', type='url', required=True)]),
            dict(id='slack', label='Slack', description='Read the Slack public status API.', defaultOwner='vendor', fields=[]),
            dict(id='google', label='Google Workspace', description='Read the Google incidents feed.', defaultOwner='vendor', fields=[dict(key='products', label='Products', type='text')]),
            dict(id='http', label='HTTP check', description='Check an approved internal or public endpoint.', defaultOwner='internal', fields=[dict(key='url', label='URL to check', type='url', required=True), dict(key='expectStatus', label='Expected status', type='number')]),
            dict(id='manual', label='Manual', description='IT declares the service state. No independent probe.', defaultOwner='internal', fields=[dict(key='state', label='Declared state', type='select', options=[dict(value='operational', label='Operational'), dict(value='degraded', label='Degraded'), dict(value='major_outage', label='Major outage')]), dict(key='message', label='Message', type='text')]),
        ]
        self.services = []
        for i, (name, provider, owner, description) in enumerate([
            ('Slack', 'slack', 'vendor', 'Messaging and team collaboration'),
            ('Google Workspace', 'google', 'vendor', 'Email, documents and shared calendars'),
            ('Zoom', 'statuspage', 'vendor', 'Meetings and video conferencing'),
            ('Jamf', 'statuspage', 'vendor', 'Apple device management'),
            ('Company VPN', 'http', 'internal', 'Secure access to internal resources'),
            ('Office Wi-Fi', 'http', 'internal', 'Connectivity across office locations'),
            ('IT helpdesk', 'http', 'internal', 'Support requests and service catalog'),
        ]):
            self.services.append(dict(id=str(i), name=name, provider=provider, owner=owner, description=description, group='External providers' if owner == 'vendor' else 'Internal systems', order=i, enabled=True, statusPageUrl='https://example.com/status', config={'baseUrl':'https://example.com','url':'https://example.com/health','state':'operational'}, createdAt=iso(-86400)))
        self.maintenance = [dict(id='m1', title='VPN gateway updates', description='A brief reconnection may be needed while IT updates the gateways.', services=['4'], startsAt=iso(172800), endsAt=iso(176400), status='scheduled')]
        self.posts = [dict(id='p1', title='Welcome to your service hub', body='Illustrative demo data, not live provider status. Check here for service updates before opening a support request.', severity='info', pinned=True, resolved=False, services=[], updates=[], createdAt=iso(-3600), updatedAt=iso(-3600)), dict(id='p2', title='Password reset delays', body='Self-service resets are working again.', severity='warning', pinned=False, resolved=True, services=['6'], updates=[], createdAt=iso(-86400), updatedAt=iso(-36000), resolvedAt=iso(-36000))]

    def snapshot(self):
        rows = []
        for s in self.services:
            if s.get('enabled') is False: continue
            state = 'degraded' if s['id'] == '0' else 'unknown' if s['id'] == '5' else s.get('config', {}).get('state', 'operational') if s['provider'] == 'manual' else 'operational'
            label = dict(operational='Operational', degraded='Degraded', major_outage='Major outage', unknown='Unknown', maintenance='Under maintenance').get(state, state)
            row = {**s, 'config': None, 'state': state, 'label': label, 'vendorState':state, 'freshness': 'stale' if state == 'unknown' else 'fresh', 'checkedAt':iso(-240 if state == 'unknown' else -12), 'expiresAt':iso(-1 if self.mode == 'stale' else 168), 'lastSuccessfulAt':iso(-240 if state == 'unknown' else -12), 'summary': 'Message delivery is delayed.' if s['id'] == '0' else 'Check completed successfully.', 'error':None, 'lastKnown':dict(state='operational', checkedAt=iso(-240)) if state == 'unknown' else None, 'ours': state == 'major_outage' and s['owner'] == 'internal', 'theirs':s['id'] == '0', 'incidents':[], 'reason':None}
            row.pop('config')
            rows.append(row)
        count = len(rows)
        ns = lambda p: {**p, 'serviceNames':[s['name'] for s in self.services if s['id'] in p.get('services', [])]}
        return dict(generatedAt=iso(), site=dict(name='Is it us or them?', org='Example IT', pollIntervalSeconds=60, staleAfterSeconds=180), verdict=dict(who='them', level='degraded', headline="It's them.", detail='Slack is reporting message delivery delays. Internal systems have no reported incidents; one check needs verification.', counts=dict(total=count, issues=1, maintenance=0, unknown=1, stale=1), us=[], them=['Slack']), services=rows, incidents=[dict(id='i1', title='Message delivery delays', serviceName='Slack', serviceId='0', impact='minor', owner='vendor', status='investigating', latestUpdate='The provider is investigating delayed messages. Follow the source update for the latest information.', updatedAt=iso(-480), url='https://example.com/incident', components=['Messaging'])], maintenance=dict(active=[], upcoming=[{**ns(m), 'phase':'upcoming'} for m in self.maintenance if m['status']=='scheduled'], vendor=[]), posts=dict(open=[ns(p) for p in self.posts if not p.get('resolved')], recent=[ns(p) for p in self.posts if p.get('resolved')]))

    def route(self, route):
        request = route.request
        path = urlparse(request.url).path
        self.calls.append((request.method, path, request.headers.get('authorization', '')))
        def reply(data, status=200): route.fulfill(status=status, content_type='application/json', body=json.dumps(data))
        if self.mode == 'offline': return reply({'error':'Fixture connection failure'}, 503)
        admin = path.startswith('/api/services') or path == '/api/admin/whoami' or request.method != 'GET'
        if admin and request.headers.get('authorization') != 'Bearer '+TOKEN: return reply({'error':'Admin token required'}, 401)
        if path == '/api/admin/whoami': return reply({'ok':True})
        if path == '/api/status':
            if self.mode == 'invalid': return reply({'not':'a snapshot'})
            if self.mode == 'empty':
                snap = self.snapshot(); snap.update(services=[], incidents=[], maintenance=dict(active=[],upcoming=[],vendor=[]), posts=dict(open=[],recent=[])); snap['verdict'].update(who='unknown',level='unknown',headline='No services configured.',detail='Nothing is being tracked yet.',counts=dict(total=0,issues=0,maintenance=0,unknown=0,stale=0)); return reply(snap)
            return reply(self.snapshot())
        if path == '/api/providers': return reply(self.providers)
        if path == '/api/status.txt': return route.fulfill(content_type='text/plain', body='Demo status summary')
        if request.method != 'GET' and self.fail_write: return reply({'error':'Fixture write failed. Nothing was changed.'}, 500)
        parts = path.split('/')
        collection = {'services':self.services, 'maintenance':self.maintenance, 'posts':self.posts}.get(parts[2] if len(parts)>2 else '')
        if collection is None: return reply({'error':'Not found'}, 404)
        if path == '/api/services/test': return reply({'ok':True,'status':dict(state='degraded',summary='Fixture reports degraded service.',latencyMs=32,incidents=[])})
        if request.method == 'GET': return reply(collection)
        body = request.post_data_json or {}
        if len(parts) == 3 and request.method == 'POST':
            self.next_id += 1; item = dict(id=str(self.next_id), createdAt=iso(), updatedAt=iso(), resolved=False, updates=[], **body); collection.append(item); return reply(item, 201)
        item = next((x for x in collection if x['id'] == parts[3]), None)
        if not item: return reply({'error':'Not found'}, 404)
        if request.method == 'DELETE': collection.remove(item); return route.fulfill(status=204)
        if len(parts)>4 and parts[4] == 'state': item['config'].update(body)
        elif len(parts)>4 and parts[4] == 'updates':
            item.setdefault('updates', []).insert(0, dict(id='u1',at=iso(),body=body['body'])); item['resolved']=body.get('resolved', item.get('resolved',False))
        elif len(parts)>4 and parts[4] == 'refresh': pass
        else: item.update(body)
        item['updatedAt'] = iso()
        return reply(item)

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Horizontal page overflow at {page.viewport_size}'

def run(output):
    handler = partial(Static, directory=str(ROOT/'public'))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        browser = p.chromium.launch(**({'executable_path':executable} if executable else {}), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width':1440,'height':1050}, color_scheme='light', reduced_motion='reduce')
        fixture = Fixture(); context.route('**/api/**', fixture.route)
        page = context.new_page(); errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url); expect(page.locator('#verdict-title')).to_have_text("It's them."); no_overflow(page)
        page.screenshot(path=str(output/'dashboard-light.png'), full_page=True)
        checks.append('Public dashboard renders the fixture and fresh/unknown observations.')
        page.locator('#theme-select').select_option('dark'); expect(page.locator('html')).to_have_attribute('data-theme','dark')
        page.reload(); expect(page.locator('html')).to_have_attribute('data-theme','dark'); expect(page.locator('#verdict-title')).to_have_text("It's them.")
        page.screenshot(path=str(output/'dashboard-dark.png'), full_page=True)
        page.locator('#service-search').fill('VPN'); expect(page.locator('.service-row')).to_have_count(1)
        page.locator('#service-search').fill('absent service'); expect(page.locator('#clear-filters')).to_be_visible(); page.locator('#clear-filters').click(); expect(page.locator('.service-row')).to_have_count(7)
        page.get_by_role('button',name='Internal',exact=True).click(); expect(page.locator('.service-row')).to_have_count(3)
        page.get_by_role('button',name='All',exact=True).click()
        summary = page.locator('.service-row summary').first; summary.click(); summary.focus(); page.locator('#refresh-status').click(); expect(page.locator('.service-row').first).to_have_attribute('open','')
        checks.append('Search, ownership filters, clear filters and disclosure persistence work.')
        fixture.mode='offline'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text('Live status unavailable.'); expect(page.locator('.service-row .status-badge').first).to_have_text('Cached / unverified')
        page.wait_for_timeout(1200); expect(page.locator('#verdict-title')).to_have_text('Live status unavailable.')
        fixture.mode='normal'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text("It's them.")
        fixture.mode='stale'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text('Status information is stale.')
        fixture.mode='invalid'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text('Live status unavailable.')
        fixture.mode='empty'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text('No services configured.'); expect(page.get_by_role('link',name='Set up monitoring')).to_be_visible()
        fixture.mode='normal'; page.locator('#refresh-status').click(); expect(page.locator('#verdict-title')).to_have_text("It's them.")
        checks.append('Offline, stale, malformed-response, recovery and first-run states remain truthful.')
        for width in [320,390,768,1024,1440]:
            page.set_viewport_size({'width':width,'height':950}); no_overflow(page)
        page.set_viewport_size({'width':390,'height':844}); page.screenshot(path=str(output/'dashboard-mobile.png'),full_page=True)
        assert all(not auth for method,path,auth in fixture.calls if path == '/api/status'), 'Public dashboard sent an admin bearer'
        checks.append('Public dashboard reflows at 320/390/768/1024/1440px; public fetch has no bearer.')
        page.goto(url+'/admin'); expect(page.locator('#gate')).to_be_visible(); page.locator('#theme-select').select_option('light')
        page.set_viewport_size({'width':1440,'height':1000}); page.screenshot(path=str(output/'admin-signin.png'),full_page=True)
        page.locator('#token').fill('incorrect'); page.locator('#gate-submit').click(); expect(page.locator('#gate-error')).to_contain_text('not accepted')
        page.locator('#token').fill(TOKEN); page.locator('#gate-submit').click(); expect(page.locator('#admin')).to_be_visible(); expect(page.locator('#services-table tbody tr')).to_have_count(7)
        page.screenshot(path=str(output/'admin-services.png'),full_page=True)
        page.locator('#tab-button-services').focus(); page.keyboard.press('ArrowRight'); expect(page.locator('#tab-button-incidents')).to_have_attribute('aria-selected','true'); expect(page.locator('#tab-incidents')).to_be_visible()
        page.keyboard.press('End'); expect(page.locator('#tab-button-posts')).to_have_attribute('aria-selected','true'); page.keyboard.press('Home'); expect(page.locator('#tab-services')).to_be_visible()
        page.locator('#add-service').click(); expect(page.locator('#dialog')).to_be_visible(); expect(page.locator('#dialog-title')).to_be_focused(); page.keyboard.press('Escape'); expect(page.locator('#dialog')).not_to_be_visible(); expect(page.locator('#add-service')).to_be_focused()
        checks.append('Authentication failure, sign-in, arrow/Home/End tabs, dialog naming and Escape focus restoration work.')
        page.locator('#add-service').click(); page.locator('#field-name').fill('Test app'); page.locator('#field-config-baseUrl').fill('https://example.com')
        page.locator('#field-provider').select_option('http'); page.locator('#field-config-url').fill('https://example.com/health')
        page.locator('#field-provider').select_option('statuspage'); expect(page.locator('#field-config-baseUrl')).to_have_value('https://example.com')
        page.locator('#field-provider').select_option('http'); expect(page.locator('#field-config-url')).to_have_value('https://example.com/health')
        page.locator('#dialog-test').click(); expect(page.locator('#dialog-result')).to_contain_text('Degraded'); assert not page.locator('#dialog-result .notice.success').count()
        page.screenshot(path=str(output/'admin-service-dialog.png'),full_page=True)
        fixture.fail_write=True; page.locator('#dialog-save').click(); expect(page.locator('#dialog-error')).to_contain_text('Nothing was changed'); expect(page.locator('#dialog')).to_be_visible(); expect(page.locator('#dialog-save')).to_be_enabled()
        fixture.fail_write=False; page.locator('#dialog-save').click(); expect(page.locator('#dialog')).not_to_be_visible(); expect(page.locator('#services-table tbody tr')).to_have_count(8)
        page.get_by_role('button',name='Edit Test app',exact=True).click(); page.locator('#field-enabled').uncheck(); page.locator('#dialog-save').click(); expect(page.get_by_role('button',name='Check now Test app',exact=True)).to_have_count(0)
        page.get_by_role('button',name='Edit Test app',exact=True).click(); page.locator('#dialog-delete').click(); expect(page.locator('#confirm-dialog')).to_be_visible(); page.get_by_role('button',name='Keep item').click(); expect(page.locator('#dialog')).to_be_visible(); page.locator('#dialog-delete').click(); page.get_by_role('button',name='Delete permanently').click(); expect(page.locator('#services-table tbody tr')).to_have_count(7)
        checks.append('Provider drafts, truthful feed tests, failed-save recovery, create/disable/delete and delete cancellation work.')
        page.locator('#tab-button-incidents').click(); page.locator('#add-incident').click(); page.locator('#field-title').fill('Internal test incident'); page.locator('#field-body').fill('Fixture incident description.'); page.locator('#dialog-save').click(); expect(page.get_by_role('button',name='Add update Internal test incident')).to_be_visible()
        page.get_by_role('button',name='Add update Internal test incident').click(); page.locator('#field-body').fill('Resolved in the fixture.'); page.locator('#field-resolved').check(); page.locator('#dialog-save').click(); expect(page.get_by_role('button',name='Reopen Internal test incident')).to_be_visible(); page.get_by_role('button',name='Reopen Internal test incident').click(); expect(page.get_by_role('button',name='Resolve Internal test incident')).to_be_visible()
        page.locator('#tab-button-posts').click(); page.locator('#add-post').click(); page.locator('#field-title').fill('Test announcement'); page.locator('#dialog-save').click(); expect(page.get_by_role('button',name='Archive Test announcement')).to_be_visible(); page.get_by_role('button',name='Archive Test announcement').click(); expect(page.get_by_role('button',name='Publish Test announcement')).to_be_visible()
        page.locator('#tab-button-maintenance').click(); page.locator('#add-maintenance').click(); page.locator('#field-title').fill('Test maintenance'); page.locator('#dialog-save').click(); expect(page.get_by_role('button',name='Start now Test maintenance')).to_be_visible(); page.get_by_role('button',name='Start now Test maintenance').click(); expect(page.get_by_role('button',name='Complete Test maintenance')).to_be_visible(); page.get_by_role('button',name='Complete Test maintenance').click(); expect(page.get_by_role('button',name='Complete Test maintenance')).to_have_count(0)
        checks.append('Incidents and announcements are separate; updates/resolution/reopen/archive and maintenance transitions work.')
        page.locator('#tab-button-services').click(); page.locator('#theme-select').select_option('dark')
        for width in [320,390,768,1024,1440]:
            page.set_viewport_size({'width':width,'height':950}); no_overflow(page)
        page.set_viewport_size({'width':390,'height':844}); page.screenshot(path=str(output/'admin-mobile.png'),full_page=True)
        page.locator('#add-service').click(); no_overflow(page); page.screenshot(path=str(output/'admin-dialog-mobile.png'),full_page=True)
        # Native modal contains keyboard focus, including wraparound.
        for _ in range(25):
            page.keyboard.press('Tab'); assert page.locator('#dialog').evaluate('(e) => e.contains(document.activeElement)')
        page.keyboard.press('Escape'); page.locator('#signout').click(); expect(page.locator('#gate')).to_be_visible(); assert page.evaluate('localStorage.getItem("adminToken")') is None
        checks.append('Admin and dialogs reflow at tested widths; native focus trap and sign-out work.')
        assert not errors, '\n'.join(errors)
        checks.append('No uncaught browser exceptions.')
        browser.close()
    server.shutdown(); server.server_close()
    (output/'ui-check-results.json').write_text(json.dumps({'passed':checks,'screenshots':'Actual frontend with simulated API data, not live provider status.'},indent=2)+'\n')
    print('\n'.join('PASS '+message for message in checks))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--output', type=Path, default=ROOT/'ui-artifacts'); args=parser.parse_args(); run(args.output)
