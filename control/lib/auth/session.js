// HMAC-signed session token, used by middleware.js + /api/auth/*.
// The token is `<exp>.<base64url(hmac(password, exp))>`. Signing with the
// password itself means rotating CONTROL_PLANE_PASSWORD invalidates every
// outstanding session with no extra bookkeeping.
//
// Web Crypto only — middleware runs on the Edge runtime.

const enc = new TextEncoder();

export const SESSION_COOKIE = 'mojulo_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function isAuthEnabled() {
  return !!(process.env.CONTROL_PLANE_USER && process.env.CONTROL_PLANE_PASSWORD);
}

async function hmacKey(password) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64urlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + pad);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export async function createSessionToken(password, ttlSeconds = SESSION_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const key = await hmacKey(password);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(exp)));
  return `${exp}.${b64urlEncode(sig)}`;
}

export async function verifySessionToken(token, password) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  try {
    const key = await hmacKey(password);
    return await crypto.subtle.verify('HMAC', key, b64urlDecode(sigStr), enc.encode(expStr));
  } catch {
    return false;
  }
}
