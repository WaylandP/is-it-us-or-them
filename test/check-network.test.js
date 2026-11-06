import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { checkUrl, createNetworkPolicy, policyFromEnvironment, resolveTarget, safeCheckRequest } from '../src/check-network.js';

const publicPolicy = createNetworkPolicy();
const permitted = (origin) => createNetworkPolicy({ [origin]: ['127.0.0.1/32'] });
async function server(t, handler) {
  const srv = http.createServer(handler);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }));
  return { srv, origin: `http://127.0.0.1:${srv.address().port}` };
}

for (const value of [
  'file:///etc/passwd', 'ftp://example.com/', 'http://user:pass@example.com/',
  'http://example.com/#fragment', 'http://example.com\\@localhost/', 'http://example.com/\n',
]) test(`reject unsafe URL form: ${JSON.stringify(value)}`, () => assert.throws(() => checkUrl(value)));

for (const host of [
  '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0',
  '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200',
  '192.0.2.1', '198.51.100.1', '203.0.113.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
  '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:169.254.169.254]', '[fe80::1]', '[fc00::1]',
  '[64:ff9b::7f00:1]', '[2002:7f00:1::]', '[2001:db8::1]', '[3fff::1]', '[ff02::1]',
]) test(`default policy denies ${host}`, async () => {
  await assert.rejects(resolveTarget(`http://${host}/`, publicPolicy), { code: 'CHECK_POLICY' });
});

test('valid public IPv4 and IPv6 destinations are accepted', async () => {
  for (const host of ['8.8.8.8', '[2606:4700:4700::1111]']) assert.ok(await resolveTarget(`https://${host}`, publicPolicy));
  await assert.rejects(resolveTarget('http://8.8.8.8:9000', publicPolicy), { code: 'CHECK_POLICY' });
});

test('exact origin plus CIDR, not just a hostname or a private-net switch', async () => {
  const p = createNetworkPolicy({ 'https://wiki.internal:8443': ['10.20.0.5/32'] });
  const dns = async () => [{ address: '10.20.0.5', family: 4 }];
  await resolveTarget('https://wiki.internal:8443/health', p, dns);
  for (const url of ['http://wiki.internal:8443', 'https://wiki.internal', 'https://evil.internal:8443']) {
    await assert.rejects(resolveTarget(url, p, dns), { code: 'CHECK_POLICY' });
  }
  await assert.rejects(resolveTarget('https://wiki.internal:8443', p, async () => [{ address: '10.20.0.6', family: 4 }]));
});

test('metadata/link-local cannot be allowed even by an overbroad CIDR', async () => {
  const url = 'http://169.254.169.254';
  await assert.rejects(resolveTarget(url, createNetworkPolicy({ [url]: ['0.0.0.0/0'] })), { code: 'CHECK_POLICY' });
});

test('reject mixed public/private DNS answers and malformed/empty answers', async () => {
  for (const answers of [[], [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 6 }]]) {
    await assert.rejects(resolveTarget('https://feed.example', publicPolicy, async () => answers));
  }
});

test('invalid operator configuration fails rather than widening access', () => {
  for (const targets of [null, [], { 'https://a/path': ['10.0.0.1/32'] }, { 'https://a': [] }, { 'https://a': ['10.0.0.0/99'] }, { 'https://a': ['10.0.0.0'] }]) {
    assert.throws(() => createNetworkPolicy(targets));
  }
  assert.throws(() => policyFromEnvironment({ CHECK_ALLOWED_TARGETS: '{bad' }));
  assert.throws(() => policyFromEnvironment({ HTTPS_PROXY: 'http://secret:password@proxy' }), /Proxy-based/);
});

test('approved local check works; default policy never contacts the same server', async (t) => {
  let hits = 0;
  const { origin } = await server(t, (_req, res) => { hits++; res.end('ok'); });
  await assert.rejects(safeCheckRequest(origin, { policy: publicPolicy }));
  assert.equal(hits, 0);
  const response = await safeCheckRequest(origin, { policy: permitted(origin) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(hits, 1);
});

test('connection uses vetted DNS answers once, preserving the Host header', async (t) => {
  let host;
  const { srv } = await server(t, (req, res) => { host = req.headers.host; res.end('ok'); });
  const url = `http://feed.example:${srv.address().port}`;
  let lookups = 0;
  const lookup = async () => { lookups++; return [{ address: lookups === 1 ? '127.0.0.1' : '169.254.169.254', family: 4 }]; };
  await safeCheckRequest(url, { policy: permitted(url), lookup });
  assert.equal(lookups, 1);
  assert.equal(host, new URL(url).host);
});

test('each redirect is revalidated and a blocked redirect is never contacted', async (t) => {
  let destinationHits = 0;
  const destination = await server(t, (_req, res) => { destinationHits++; res.end('secret'); });
  const first = await server(t, (_req, res) => { res.writeHead(302, { location: destination.origin }); res.end(); });
  await assert.rejects(safeCheckRequest(first.origin, { policy: permitted(first.origin) }), { code: 'CHECK_POLICY' });
  assert.equal(destinationHits, 0);
  const policy = createNetworkPolicy({ [first.origin]: ['127.0.0.1/32'], [destination.origin]: ['127.0.0.1/32'] });
  assert.equal(await (await safeCheckRequest(first.origin, { policy })).text(), 'secret');
});

test('redirect loops and credentialed redirects fail closed', async (t) => {
  const { origin } = await server(t, (req, res) => {
    res.writeHead(302, { location: req.url === '/creds' ? 'http://user:password@example.com' : '/' }); res.end();
  });
  await assert.rejects(safeCheckRequest(origin, { policy: permitted(origin) }), { code: 'CHECK_REDIRECT' });
  await assert.rejects(safeCheckRequest(`${origin}/creds`, { policy: permitted(origin) }), { code: 'CHECK_POLICY' });
});

test('limits include chunked and compressed/decompressed response sizes', async (t) => {
  const { origin } = await server(t, (req, res) => {
    if (req.url === '/gzip') { res.setHeader('content-encoding', 'gzip'); res.end(gzipSync('x'.repeat(10000))); }
    else { res.write('x'.repeat(100)); res.end('x'.repeat(100)); }
  });
  for (const path of ['/', '/gzip']) {
    await assert.rejects(safeCheckRequest(origin + path, { policy: permitted(origin), maxBytes: 128 }), { code: 'CHECK_LIMIT' });
  }
});

test('one deadline covers stalled response bodies and DNS', async (t) => {
  const { origin } = await server(t, (_req, res) => { res.writeHead(200); res.write('never finishes'); });
  await assert.rejects(safeCheckRequest(origin, { policy: permitted(origin), timeoutMs: 50 }), { code: 'CHECK_TIMEOUT' });
  await assert.rejects(safeCheckRequest('https://feed.example', { policy: publicPolicy, lookup: () => new Promise(() => {}), timeoutMs: 50 }), { code: 'CHECK_TIMEOUT' });
});

test('credentials and arbitrary methods cannot enter the transport', async () => {
  await assert.rejects(safeCheckRequest('https://example.com', { policy: publicPolicy, headers: { Authorization: 'secret' } }));
  await assert.rejects(safeCheckRequest('https://example.com', { policy: publicPolicy, method: 'POST' }));
});

for (const host of ['168.63.129.16', '[fd00:ec2::254]']) test(`cloud control endpoint cannot be explicitly allowed: ${host}`, async () => {
  const url = `http://${host}`;
  const cidr = host.startsWith('[') ? 'fc00::/7' : '0.0.0.0/0';
  await assert.rejects(resolveTarget(url, createNetworkPolicy({ [url]: [cidr] })), { code: 'CHECK_POLICY' });
});

test('TLS preserves SNI, verifies hostname and blocks HTTPS downgrades', async (t) => {
  const https = await import('node:https');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { spawn } = await import('node:child_process');
  const certPath = fileURLToPath(new URL('./fixtures/check-test-cert.pem', import.meta.url));
  const key = fs.readFileSync(new URL('./fixtures/check-test-key.pem', import.meta.url));
  const cert = fs.readFileSync(certPath);
  let host, sni, hits = 0;
  const srv = https.createServer({ key, cert }, (req, res) => {
    hits++; host = req.headers.host; sni = req.socket.servername;
    if (req.url === '/downgrade') res.writeHead(302, { location: 'http://127.0.0.1/' });
    res.end('ok');
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }));
  const port = srv.address().port;
  const child = (hostname, path = '') => new Promise((resolve, reject) => {
    const url = `https://${hostname}:${port}`;
    const code = `import { safeCheckRequest, createNetworkPolicy } from ${JSON.stringify(new URL('../src/check-network.js', import.meta.url).href)};
      try { await safeCheckRequest(${JSON.stringify(url + path)}, { policy: createNetworkPolicy({[${JSON.stringify(url)}]: ['127.0.0.1/32']}), lookup: async () => [{address:'127.0.0.1',family:4}] }); console.log('OK'); }
      catch (e) { console.log(e.code); }`;
    const proc = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath, NODE_TLS_REJECT_UNAUTHORIZED: '0' } });
    let output = '';
    proc.stdout.on('data', (chunk) => { output += chunk; });
    proc.stderr.resume();
    proc.on('error', reject);
    proc.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`TLS child failed: ${code}`)));
  });
  assert.equal(await child('feed.example'), 'OK');
  assert.equal(host, `feed.example:${port}`);
  assert.equal(sni, 'feed.example');
  assert.equal(await child('wrong.example'), 'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(hits, 1, 'a certificate failure must not send an HTTP request');
  assert.equal(await child('feed.example', '/downgrade'), 'CHECK_REDIRECT');
});

test('port zero is never a permitted check destination', () => {
  assert.throws(() => checkUrl('http://127.0.0.1:0'), { code: 'CHECK_POLICY' });
});
