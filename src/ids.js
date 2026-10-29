import crypto from 'node:crypto';

export function newId() {
  return crypto.randomBytes(6).toString('base64url');
}
