/** Stored Web Push subscription (Phase 2). No VAPID keys. */

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  installationId: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPushSubscriptionInput {
  installationId: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface PushSubscribeResult {
  installationId: string;
  endpointHash: string;
  updated: boolean;
}
