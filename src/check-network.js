import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

// Conservative destination policy, based on the IANA special-purpose registries.
// Exact operator-approved origins AND CIDRs are required for private/loopback checks.
const block = (cidrs) => {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [ip, bits, extra] = cidr.split('/');
    const family = isIP(ip);
    if (extra !== undefined || !family || !/^\d+$/.test(bits || '') || Number(bits) > (family === 4 ? 32 : 128)) {
      throw new Error('Invalid CIDR in CHECK_ALLOWED_TARGETS');
    }
    list.addSubnet(ip, Number(bits), family === 4 ? 'ipv4' : 'ipv6');
  }
  return list;
};
const contains = (list, ip) => list.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
const privateAddresses = block(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', 'fc00::/7', '::1/128']);
const prohibited = block([
  '0.0.0.0/8', '100.64.0.0/10', '169.254.0.0/16', '168.63.129.16/32', 'fd00:ec2::254/128', '192.0.0.0/24', '192.0.2.0/24',
  '192.88.99.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
  '::/128', '2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20',
]);
const globalV6 = block(['2000::/3']);

export class CheckError extends Error {
  constructor(message, code = 'CHECK_POLICY') {
    super(message);
    this.name = 'CheckError';
    this.code = code;
  }
}

export function checkUrl(value) {
  const raw = String(value);
  if (/[\\\s\u0000-\u001f\u007f]/u.test(raw)) throw new CheckError('Check URL contains disallowed characters');
  let url;
  try { url = new URL(raw); } catch { throw new CheckError('Check URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*')) {
    throw new CheckError('Only HTTP and HTTPS check URLs are allowed');
  }
  if (url.port === '0') throw new CheckError('Port zero is not a valid check destination');
  if (url.username || url.password || url.hash) throw new CheckError('Check URLs cannot contain credentials or fragments');
  return url;
}

export function createNetworkPolicy(targets = {}) {
  if (!targets || Array.isArray(targets) || typeof targets !== 'object') throw new Error('CHECK_ALLOWED_TARGETS must be a JSON object');
  const origins = new Map();
  for (const [origin, cidrs] of Object.entries(targets)) {
    const url = checkUrl(origin);
    if (url.pathname !== '/' || url.search || !Array.isArray(cidrs) || !cidrs.length || cidrs.some((x) => typeof x !== 'string')) {
      throw new Error('CHECK_ALLOWED_TARGETS must map origins (no path/query) to nonempty CIDR arrays');
    }
    if (origins.has(url.origin)) throw new Error('Duplicate normalized origin in CHECK_ALLOWED_TARGETS');
    origins.set(url.origin, block(cidrs));
  }
  return { origins };
}

export function policyFromEnvironment(env = process.env) {
  // A proxy can resolve the hostname again, defeating client-side DNS pinning.
  // Do not silently bypass the proxy or silently weaken destination validation.
  if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some((key) => env[key])) {
    throw new CheckError('Proxy-based checks are not supported by the pinned transport; configure direct restricted egress', 'CHECK_PROXY');
  }
  let targets;
  try { targets = JSON.parse(env.CHECK_ALLOWED_TARGETS || '{}'); }
  catch { throw new Error('CHECK_ALLOWED_TARGETS must contain valid JSON'); }
  return createNetworkPolicy(targets);
}

export function addressAllowed(ip, url, policy) {
  if (!isIP(ip) || ip.includes('%') || contains(prohibited, ip)) return false;
  const approval = policy.origins.get(url.origin);
  const privateIp = contains(privateAddresses, ip);
  // IPv6 translations, multicast, link-local and unallocated space are excluded.
  if (isIP(ip) === 6 && !privateIp && !contains(globalV6, ip)) return false;
  if (approval) return contains(approval, ip);
  return !privateIp && (!url.port || url.port === '80' || url.port === '443');
}

export async function resolveTarget(value, policy, lookup = dnsLookup) {
  const url = checkUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(({ address, family }) =>
    !addressAllowed(address, url, policy) || family !== isIP(address))) {
    throw new CheckError('Check destination is blocked; an exact origin and permitted CIDRs may be required');
  }
  return { url, addresses };
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function requestOnce({ url, addresses }, { signal, maxBytes, method, headers }) {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const transport = secure ? https : http;
    const agent = new transport.Agent({ keepAlive: false, proxyEnv: {}, maxCachedSessions: 0 });
    let settled = false;
    let response;
    let decoded;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      decoded?.destroy();
      response?.destroy();
      agent.destroy();
      if (error) reject(signal.aborted ? signal.reason : error);
      else resolve(result);
    };
    const req = transport.request(url, {
      agent, signal, method, headers, maxHeaderSize: 16384, rejectUnauthorized: true,
      // No second DNS lookup: preserve original hostname/Host/SNI and TLS verification.
      lookup: (_hostname, options, callback) => {
        const choices = options.family ? addresses.filter((a) => a.family === options.family) : addresses;
        if (!choices.length) return callback(new CheckError('No approved address for the requested family'));
        if (options.all) callback(null, choices);
        else callback(null, choices[0].address, choices[0].family);
      },
    }, (res) => {
      response = res;
      const status = res.statusCode;
      const result = { status, headers: res.headers, body: '' };
      if ([301, 302, 303, 307, 308].includes(status)) return finish(null, result);
      if (Number(res.headers['content-length']) > maxBytes) return finish(new CheckError('Check response exceeds the byte limit', 'CHECK_LIMIT'));
      const encoding = (res.headers['content-encoding'] || 'identity').toLowerCase();
      if (encoding === 'gzip') decoded = createGunzip();
      else if (encoding === 'deflate') decoded = createInflate();
      else if (encoding === 'br') decoded = createBrotliDecompress();
      else if (encoding !== 'identity') return finish(new CheckError('Unsupported check response encoding', 'CHECK_ENCODING'));
      let wireBytes = 0;
      let bodyBytes = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        wireBytes += chunk.length;
        if (wireBytes > maxBytes) finish(new CheckError('Check response exceeds the byte limit', 'CHECK_LIMIT'));
      });
      res.on('error', (err) => finish(err));
      res.on('aborted', () => finish(new CheckError('Check response was interrupted', 'CHECK_INTERRUPTED')));
      const stream = decoded ? res.pipe(decoded) : res;
      stream.on('error', (err) => finish(err));
      stream.on('data', (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes > maxBytes) return finish(new CheckError('Decoded response exceeds the byte limit', 'CHECK_LIMIT'));
        chunks.push(chunk);
      });
      stream.on('end', () => finish(null, { ...result, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', (err) => finish(err));
    req.on('upgrade', (_res, socket) => { socket.destroy(); finish(new CheckError('Protocol upgrades are not allowed')); });
    req.end();
  });
}

/** A small, bounded fetch-like GET/HEAD client for every monitoring provider. */
export async function safeCheckRequest(value, {
  timeoutMs = 10000, maxBytes = 1024 * 1024, method = 'GET', headers = {},
  policy = policyFromEnvironment(), lookup = dnsLookup,
} = {}) {
  if (!['GET', 'HEAD'].includes(method)) throw new CheckError('Checks only support GET and HEAD');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxBytes) || maxBytes <= 0) throw new CheckError('Invalid check limits');
  const requestHeaders = { 'user-agent': 'is-it-us-or-them/0.1', accept: 'application/json, text/xml, application/xml, */*', 'accept-encoding': 'identity' };
  for (const [key, val] of Object.entries(headers)) {
    if (!['accept', 'user-agent'].includes(key.toLowerCase())) throw new CheckError('Custom credential or routing headers are not supported');
    requestHeaders[key.toLowerCase()] = val;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new CheckError('Monitoring request timed out', 'CHECK_TIMEOUT')), timeoutMs);
  try {
    let next = checkUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      const target = await abortable(resolveTarget(next.href, policy, lookup), controller.signal);
      const res = await requestOnce(target, { signal: controller.signal, maxBytes, method, headers: requestHeaders });
      if (![301, 302, 303, 307, 308].includes(res.status)) {
        return { status: res.status, ok: res.status >= 200 && res.status < 300, headers: new Headers(res.headers), text: async () => res.body };
      }
      if (!res.headers.location) throw new CheckError('Redirect has no destination', 'CHECK_REDIRECT');
      if (hop === 3) throw new CheckError('Too many check redirects', 'CHECK_REDIRECT');
      // Validate raw Location as well, before WHATWG normalization can remove controls.
      if (/[\\\s\u0000-\u001f\u007f]/u.test(res.headers.location)) throw new CheckError('Unsafe redirect destination', 'CHECK_REDIRECT');
      const redirected = checkUrl(new URL(res.headers.location, next).href);
      if (next.protocol === 'https:' && redirected.protocol !== 'https:') throw new CheckError('HTTPS downgrade redirect is blocked', 'CHECK_REDIRECT');
      next = redirected;
    }
  } finally { clearTimeout(timer); }
}
