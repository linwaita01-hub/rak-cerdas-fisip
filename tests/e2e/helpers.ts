import { type Page, expect } from "@playwright/test";

export const SUPABASE_URL = "https://ehftibpdwpeszobzagua.supabase.co";
export const PUBLISHABLE = "sb_publishable_8O8i-B-0cBOtzGUM1PXhUg_nzp4pjFc";

export const ADMIN = { email: "admin.demo@fisip.ulm.ac.id", password: "AdminDemo#2026" };
export const MAHASISWA = { email: "mahasiswa.demo@fisip.ulm.ac.id", password: "MhsDemo#2026" };

// Menunggu React selesai hidrasi (agar handler onSubmit dsb. sudah terpasang
// dan form tidak ter-submit natif). __perpusReady diset di RootComponent.
export async function waitHydrated(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __perpusReady?: boolean }).__perpusReady === true,
    null,
    { timeout: 25_000 },
  );
}

export async function gotoHydrated(page: Page, path: string) {
  await page.goto(path);
  await waitHydrated(page);
}

// ---- UI login ----
export async function login(page: Page, email: string, password: string) {
  await gotoHydrated(page, "/auth");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-pass").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL("**/app", { timeout: 25_000 });
}

// ---- REST helpers (memakai token demo; RLS tetap berlaku) ----
export async function getToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("Gagal login REST: " + JSON.stringify(j));
  return j.access_token as string;
}

function h(token: string, extra: Record<string, string> = {}) {
  return {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type SeededBook = { bukuId: string; kode: string; barcode: string; judul: string };

export async function seedBook(token: string, prefix = "E2E"): Promise<SeededBook> {
  const kode = `${prefix}-${Date.now()}`;
  const judul = `E2E Buku ${kode}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/buku`, {
    method: "POST",
    headers: h(token, { Prefer: "return=representation" }),
    body: JSON.stringify({ kode_buku: kode, judul }),
  });
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]?.id)
    throw new Error("Gagal seed buku: " + JSON.stringify(rows));
  const bukuId = rows[0].id as string;
  const barcode = `${kode}-0001`;
  const er = await fetch(`${SUPABASE_URL}/rest/v1/eksemplar`, {
    method: "POST",
    headers: h(token),
    body: JSON.stringify({
      buku_id: bukuId,
      kode_eksemplar: barcode,
      barcode_value: barcode,
      status: "tersedia",
    }),
  });
  if (!er.ok) throw new Error("Gagal seed eksemplar: " + (await er.text()));
  return { bukuId, kode, barcode, judul };
}

export async function eksemplarStatus(token: string, barcode: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eksemplar?select=status&barcode_value=eq.${barcode}`,
    { headers: h(token) },
  );
  const rows = await res.json();
  return rows[0]?.status ?? null;
}

export async function peminjamanStatus(token: string, bukuId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/peminjaman?select=status,created_at&buku_id=eq.${bukuId}&order=created_at.desc&limit=1`,
    { headers: h(token) },
  );
  const rows = await res.json();
  return rows[0]?.status ?? null;
}

export async function eksemplarIdByBarcode(token: string, barcode: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eksemplar?select=id&barcode_value=eq.${barcode}`,
    { headers: h(token) },
  );
  return (await res.json())[0]?.id ?? null;
}

export async function profilIdByEmail(token: string, email: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`,
    { headers: h(token) },
  );
  return (await res.json())[0]?.id ?? null;
}

// Buat baris peminjaman 'menunggu' + tahan eksemplar (seperti mulaiPeminjamanMeja).
export async function buatMenunggu(
  adminToken: string,
  opts: { bukuId: string; eksemplarId: string; userId: string; durasi?: number },
): Promise<string> {
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/peminjaman`, {
    method: "POST",
    headers: h(adminToken, { Prefer: "return=representation" }),
    body: JSON.stringify({
      user_id: opts.userId,
      buku_id: opts.bukuId,
      eksemplar_id: opts.eksemplarId,
      status: "menunggu",
      durasi_hari: opts.durasi ?? 7,
    }),
  });
  const rows = await ins.json();
  if (!rows[0]?.id) throw new Error("Gagal buat menunggu: " + JSON.stringify(rows));
  await fetch(`${SUPABASE_URL}/rest/v1/eksemplar?id=eq.${opts.eksemplarId}`, {
    method: "PATCH",
    headers: h(adminToken),
    body: JSON.stringify({ status: "dipesan" }),
  });
  return rows[0].id as string;
}

// Panggil RPC via REST. Mengembalikan { status, body }.
export async function callRpc(token: string, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: h(token),
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
}

// Apakah fungsi RPC sudah ada di DB (migrasi diterapkan)? 404 = belum ada.
export async function rpcAda(token: string, fn: string, args: Record<string, unknown>) {
  const { status } = await callRpc(token, fn, args);
  return status !== 404;
}

export async function bukuByKode(token: string, kode: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/buku?select=id,kode_buku,judul&kode_buku=eq.${kode}`,
    { headers: h(token) },
  );
  return (await res.json())[0] ?? null;
}

async function deleteBook(token: string, bukuId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/peminjaman?buku_id=eq.${bukuId}`, {
    method: "DELETE",
    headers: h(token),
  });
  await fetch(`${SUPABASE_URL}/rest/v1/buku?id=eq.${bukuId}`, {
    method: "DELETE",
    headers: h(token),
  });
}

// Hapus semua data uji berprefiks E2E- (buku + peminjaman terkait; eksemplar
// ikut terhapus via cascade). Aman dipanggil di awal & akhir.
export async function cleanupE2E(token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/buku?select=id&kode_buku=like.E2E-*`, {
    headers: h(token),
  });
  const rows = await res.json();
  if (Array.isArray(rows)) {
    for (const r of rows) await deleteBook(token, r.id);
  }
}

export { expect };
