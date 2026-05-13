import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isAuthEnabled, verifySessionToken } from '@/lib/auth/session';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/health|api/auth/login|api/auth/logout|login).*)',
  ],
};

export async function middleware(req) {
  if (!isAuthEnabled()) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token, process.env.CONTROL_PLANE_PASSWORD);
  if (ok) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse('Authentication required', { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next && next !== '/login') url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}
