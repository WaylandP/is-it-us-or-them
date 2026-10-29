import crypto from 'node:crypto';
import { HttpError } from './validate.js';

export function resolveAdminToken(configured, log = console) {
  if (configured) return configured;
  const token = crypto.randomBytes(18).toString('base64url');
  log.warn?.(
    `\n[auth] ADMIN_TOKEN is not set. Generated a one-time admin token for this run:\n\n    ${token}\n\n` +
      '       Set ADMIN_TOKEN in the environment to make it permanent.\n',
  );
  return token;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function requireAdmin(token) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const provided = bearer || req.get('x-admin-token') || '';
    if (!provided || !safeEqual(provided, token)) return next(new HttpError(401, 'Admin token required'));
    next();
  };
}
