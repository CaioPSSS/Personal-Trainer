import { NextRequest, NextResponse } from 'next/server';
import {
  isAuthorized,
  unauthorizedResponse,
  verifyCalendarFeedToken,
} from '@/lib/auth';

const PUBLIC_API_PREFIXES = ['/api/auth/login', '/api/auth/logout', '/api/strava/webhook'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/login') {
    if (isAuthorized(request)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (pathname === '/api/calendar/ics') {
    const token = request.nextUrl.searchParams.get('token');
    if (isAuthorized(request) || verifyCalendarFeedToken(token)) {
      return NextResponse.next();
    }
    return unauthorizedResponse();
  }

  if (pathname.startsWith('/api/')) {
    if (!isAuthorized(request)) {
      return unauthorizedResponse();
    }
    return NextResponse.next();
  }

  if (!isAuthorized(request)) {
    const loginUrl = new URL('/login', request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath && nextPath !== '/') {
      loginUrl.searchParams.set('next', nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|ico|jpg|jpeg|webp)$).*)',
  ],
};
