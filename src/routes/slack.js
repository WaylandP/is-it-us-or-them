import crypto from 'node:crypto';
import { Router, urlencoded } from 'express';
import { buildSnapshot, renderBrief } from '../snapshot.js';
import { HttpError } from '../validate.js';

/**
 * Slack slash command endpoint. Point a slash command (e.g. /isitdown) at
 * POST /slack/command. Optional text filters by service name: "/isitdown google".
 * If SLACK_SIGNING_SECRET is set, requests are verified.
 */
export function slackRoutes({ store, poller, config }) {
  const r = Router();

  r.post(
    '/slack/command',
    urlencoded({
      extended: false,
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
    (req, res) => {
      if (config.slackSigningSecret) verifySlack(req, config.slackSigningSecret);
      const snap = buildSnapshot({ store, poller, config });
      const text = renderBrief(snap, { filter: String(req.body?.text || '') });
      res.json({ response_type: 'in_channel', text: '```' + text + '```' });
    },
  );

  return r;
}

export function verifySlack(req, secret) {
  const ts = req.get('x-slack-request-timestamp');
  const sig = req.get('x-slack-signature') || '';
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new HttpError(401, 'Stale or missing Slack timestamp');
  const base = `v0:${ts}:${req.rawBody?.toString('utf8') ?? ''}`;
  const expected = `v0=${crypto.createHmac('sha256', secret).update(base).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Invalid Slack signature');
}
