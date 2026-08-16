import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '@/types/api';
import { NotificationStoreError } from '@/lib/notifications';
import { parsePushSubscriptionInput, upsertPushSubscription, deletePushSubscription } from '@/lib/push-subscriptions';
import type { PushSubscribeResult } from '@/types/push';

function fail(status: number, error: string) {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error,
      timestamp: new Date().toISOString(),
      dataSource: 'unavailable',
    },
    { status }
  );
}

function storeStatus(err: NotificationStoreError): number {
  if (err.code === 'NOT_FOUND') return 404;
  return 400;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Invalid JSON body.');
  }

  try {
    const input = parsePushSubscriptionInput(body);
    const data = await upsertPushSubscription(input);
    return NextResponse.json<ApiResponse<PushSubscribeResult>>({
      success: true,
      data,
      timestamp: new Date().toISOString(),
      dataSource: 'live',
    });
  } catch (err) {
    if (err instanceof NotificationStoreError) {
      return fail(storeStatus(err), err.message);
    }
    return fail(500, 'Failed to store push subscription.');
  }
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Invalid JSON body.');
  }

  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  try {
    await deletePushSubscription({
      installationId: String(rec.installationId ?? ''),
      endpoint: String(rec.endpoint ?? ''),
    });
    return NextResponse.json<ApiResponse<{ deleted: true }>>({
      success: true,
      data: { deleted: true },
      timestamp: new Date().toISOString(),
      dataSource: 'live',
    });
  } catch (err) {
    if (err instanceof NotificationStoreError) {
      return fail(storeStatus(err), err.message);
    }
    return fail(500, 'Failed to delete push subscription.');
  }
}
