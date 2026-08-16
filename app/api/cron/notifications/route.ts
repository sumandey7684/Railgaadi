import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, runNotificationCron } from '@/lib/notification-cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Unauthorized',
    },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorized();
  }

  const result = await runNotificationCron();
  return NextResponse.json(result);
}
