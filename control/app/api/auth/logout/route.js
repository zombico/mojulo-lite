import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req) {
  const res = NextResponse.json({ ok: true });
  const secure = new URL(req.url).protocol === 'https:';
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  return res;
}
