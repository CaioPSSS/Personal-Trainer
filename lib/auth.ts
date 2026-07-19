import { NextRequest } from 'next/server';

export function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.CRON_SECRET;
  const publicSecret = process.env.NEXT_PUBLIC_INTERNAL_SECRET;

  if (!expectedToken && !publicSecret) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  const internalHeader = request.headers.get('x-internal-token');

  const isCronAuthorized = expectedToken && (authHeader === `Bearer ${expectedToken}` || internalHeader === expectedToken);
  const isPublicAuthorized = publicSecret && internalHeader === publicSecret;

  return !!(isCronAuthorized || isPublicAuthorized);
}
