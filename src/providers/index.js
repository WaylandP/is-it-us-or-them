import statuspage from './statuspage.js';
import slack from './slack.js';
import google from './google.js';
import rss from './rss.js';
import http from './http.js';
import manual from './manual.js';

export const providers = Object.fromEntries([statuspage, slack, google, rss, http, manual].map((p) => [p.id, p]));

export function getProvider(id) {
  return providers[id] || null;
}

/** Public descriptors for the admin UI (no functions). */
export function describeProviders() {
  return Object.values(providers).map(({ check, ...rest }) => rest);
}
