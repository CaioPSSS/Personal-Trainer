import { NextRequest } from 'next/server';

export function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const publicSecret = process.env.NEXT_PUBLIC_INTERNAL_SECRET;

  // Allow same-origin requests initiated by the web application UI
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return true;
  }

  const candidateHosts = [
    request.headers.get('x-forwarded-host'),
    request.headers.get('host'),
  ].filter((h): h is string => Boolean(h));

  const candidateOrigins = [
    request.headers.get('origin'),
    request.headers.get('referer'),
  ].filter((o): o is string => Boolean(o));

  for (const originUrl of candidateOrigins) {
    try {
      const parsedHost = new URL(originUrl).host;
      if (candidateHosts.includes(parsedHost)) {
        return true;
      }
    } catch {
      // Ignore malformed URL header
    }
  }

  if (!expectedToken && !publicSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = request.headers.get('authorization');
  const internalHeader = request.headers.get('x-internal-token');

  const isCronAuthorized =
    expectedToken &&
    (authHeader === `Bearer ${expectedToken}` || internalHeader === expectedToken);
  const isPublicAuthorized = publicSecret && internalHeader === publicSecret;

  return !!(isCronAuthorized || isPublicAuthorized);
}
