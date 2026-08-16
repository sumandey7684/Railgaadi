'use client';

const INSTALL_STORAGE_KEY = 'railgaadi-installation-id';

function randomInstallationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `install_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
}

export function getOrCreateInstallationId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomInstallationId();
    localStorage.setItem(INSTALL_STORAGE_KEY, id);
    return id;
  } catch {
    return randomInstallationId();
  }
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/notifications/vapid');
  const json = await res.json();
  if (!json.success || !json.data?.publicKey) {
    throw new Error(json.error || 'VAPID public key unavailable');
  }
  return json.data.publicKey as string;
}

/**
 * Registers `/sw.js`, subscribes to PushManager, and POSTs the subscription.
 * Does not create notification rules. Requires HTTPS (or localhost) and permission.
 */
export async function registerPushSubscription(): Promise<{ installationId: string; updated: boolean }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Web Push is not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await registration.update();
  const publicKey = await fetchVapidPublicKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const installationId = getOrCreateInstallationId();
  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId,
      subscription: subscription.toJSON(),
    }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to store push subscription');
  }
  return { installationId, updated: Boolean(json.data?.updated) };
}

export async function unregisterPushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const installationId = getOrCreateInstallationId();
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;
  if (endpoint) {
    await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId, endpoint }),
    });
    await subscription.unsubscribe();
  }
}
