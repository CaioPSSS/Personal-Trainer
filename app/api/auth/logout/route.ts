import { NextResponse } from 'next/server';
import { getSessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    ...getSessionCookieOptions(0),
    value: '',
  });
  return response;
}
