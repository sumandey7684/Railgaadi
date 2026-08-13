import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';

  const result = await rateLimit(ip);
  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED: Too many requests. Please wait before retrying.',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfter) },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
