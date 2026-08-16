import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types/api';
import { hasVapidPublicKey, vapidPublicClientPayload } from '@/lib/vapid';

/**
 * Public VAPID key only. The private key is never included in this response.
 */
export async function GET() {
  if (!hasVapidPublicKey()) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: 'VAPID_PUBLIC_KEY is not configured.',
        timestamp: new Date().toISOString(),
        dataSource: 'unavailable',
      },
      { status: 503 }
    );
  }

  return NextResponse.json<ApiResponse<{ publicKey: string }>>({
    success: true,
    data: vapidPublicClientPayload(),
    timestamp: new Date().toISOString(),
    dataSource: 'live',
  });
}
