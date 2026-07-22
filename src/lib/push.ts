import { supabase } from "@/integrations/supabase/client";

// Kunci publik VAPID (aman untuk klien). Diset via VITE_VAPID_PUBLIC_KEY.
export function getVapidPublicKey(): string | null {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;
}

export function pushDidukung(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function statusLangganan(): Promise<{
  didukung: boolean;
  izin: NotificationPermission | "unsupported";
  berlangganan: boolean;
}> {
  if (!pushDidukung()) return { didukung: false, izin: "unsupported", berlangganan: false };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { didukung: true, izin: Notification.permission, berlangganan: !!sub };
}

export async function aktifkanNotifikasi(): Promise<void> {
  if (!pushDidukung()) throw new Error("Perangkat/browser ini tidak mendukung notifikasi push.");
  const vapid = getVapidPublicKey();
  if (!vapid) throw new Error("VAPID public key belum dikonfigurasi (VITE_VAPID_PUBLIC_KEY).");

  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Izin notifikasi ditolak.");

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Anda harus masuk terlebih dahulu.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Langganan push tidak lengkap.");
  }

  const { error } = await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: u.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function matikanNotifikasi(): Promise<void> {
  if (!pushDidukung()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
}
