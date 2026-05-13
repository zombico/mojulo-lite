import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthEnabled,
} from '@/lib/auth/session';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: false, reason: 'auth_disabled' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const userMatch = safeEqual(username, process.env.CONTROL_PLANE_USER);
  const passMatch = safeEqual(password, process.env.CONTROL_PLANE_PASSWORD);
  if (!(userMatch && passMatch)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = await createSessionToken(process.env.CONTROL_PLANE_PASSWORD);
  const res = NextResponse.json({ ok: true });
  const secure = new URL(req.url).protocol === 'https:';
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
