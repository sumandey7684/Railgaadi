import webpush from 'web-push';
import { env } from '@/config/env';

/** HTTP statuses that mean the push endpoint should be deleted. */
export const PUSH_GONE_STATUS_CODES = new Set([404, 410]);

export function isExpiredPushStatus(statusCode: number | undefined): boolean {
  return statusCode != null && PUSH_GONE_STATUS_CODES.has(statusCode);
}

export function getVapidPublicKey(): string {
  return env.VAPID_PUBLIC_KEY;
}

export function getVapidSubject(): string {
  return env.VAPID_SUBJECT;
}

/** True when public key is present (enough for the browser to subscribe). */
export function hasVapidPublicKey(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY);
}

/** True when send-time VAPID is fully configured. Phase 2 does not send. */
export function hasVapidSendConfig(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

/**
 * Configures `web-push` VAPID details. Does not send notifications.
 * Returns null when private key or subject is missing.
 */
export function getConfiguredWebPush(): typeof webpush | null {
  if (!hasVapidSendConfig()) return null;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return webpush;
}

/** Public payload for GET /api/notifications/vapid — never includes the private key. */
export function vapidPublicClientPayload(): { publicKey: string } {
  return { publicKey: env.VAPID_PUBLIC_KEY };
}
