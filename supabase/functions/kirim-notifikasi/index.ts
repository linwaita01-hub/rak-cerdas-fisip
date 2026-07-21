// Edge Function: kirim-notifikasi (PART 4.4)
// Satu-satunya tempat yang memegang VAPID PRIVATE KEY + service_role.
// Dipanggil dari DB (pg_net) untuk event (persetujuan/penolakan pinjam,
// reservasi tersedia) dan dari pg_cron untuk pengingat jatuh tempo.
//
// Secrets yang perlu diset (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...),
//   NOTIF_SECRET (dicek terhadap header x-notif-secret).
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY tersedia otomatis di edge runtime.
//
// Deploy: supabase functions deploy kirim-notifikasi --no-verify-jwt
//   (autentikasi memakai NOTIF_SECRET, bukan JWT, agar bisa dipanggil pg_net.)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:perpus@fisip.ulm.ac.id";
const NOTIF_SECRET = Deno.env.get("NOTIF_SECRET") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type Payload = { title: string; body: string; url?: string; tag?: string };

async function kirimKeUser(userId: string, payload: Payload): Promise<number> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let terkirim = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      terkirim++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Langganan mati → hapus agar tidak menumpuk.
      if (code === 404 || code === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return terkirim;
}

async function pengingatJatuhTempo(): Promise<{ diproses: number; terkirim: number }> {
  const now = Date.now();
  const { data: loans } = await admin
    .from("peminjaman")
    .select("user_id, tanggal_jatuh_tempo, status, buku:buku_id(judul)")
    .in("status", ["dipinjam", "terlambat"]);

  let diproses = 0;
  let terkirim = 0;
  for (const p of loans ?? []) {
    if (!p.tanggal_jatuh_tempo) continue;
    const selisihJam = (new Date(p.tanggal_jatuh_tempo).getTime() - now) / 3600000;
    const judul = (p.buku as { judul?: string } | null)?.judul ?? "buku";
    let payload: Payload | null = null;
    if (selisihJam <= 0) {
      payload = {
        title: "Buku terlambat",
        body: `"${judul}" sudah melewati jatuh tempo. Segera kembalikan untuk menghindari denda.`,
        url: "/app",
        tag: "jatuh-tempo",
      };
    } else if (selisihJam <= 36) {
      payload = {
        title: "Pengingat jatuh tempo",
        body: `"${judul}" jatuh tempo besok. Jangan lupa dikembalikan.`,
        url: "/app",
        tag: "jatuh-tempo",
      };
    }
    if (payload) {
      diproses++;
      terkirim += await kirimKeUser(p.user_id, payload);
    }
  }
  return { diproses, terkirim };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!NOTIF_SECRET || req.headers.get("x-notif-secret") !== NOTIF_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "VAPID keys belum diset" }), { status: 500 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    if (body.tugas === "pengingat") {
      const hasil = await pengingatJatuhTempo();
      return Response.json({ ok: true, ...hasil });
    }

    const ids = (body.user_ids as string[] | undefined) ??
      (body.user_id ? [body.user_id as string] : []);
    if (!ids.length) return Response.json({ ok: true, terkirim: 0 });
    const payload: Payload = {
      title: (body.title as string) ?? "Perpus FISIP ULM",
      body: (body.body as string) ?? "",
      url: (body.url as string) ?? "/app",
      tag: body.tag as string | undefined,
    };
    let terkirim = 0;
    for (const id of ids) terkirim += await kirimKeUser(id, payload);
    return Response.json({ ok: true, terkirim });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
