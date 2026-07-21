import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============= Helper =============
async function ensureStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hanya petugas yang dapat melakukan aksi ini.");
}

// ============= MAHASISWA =============
export const ajukanPeminjaman = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ buku_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Cek kelayakan
    const { data: layak } = await context.supabase.rpc("mahasiswa_layak_pinjam", { _user_id: context.userId });
    if (!layak) throw new Error("Anda memiliki denda belum lunas atau peminjaman terlambat.");

    // Cek belum ada pengajuan aktif untuk buku ini
    const { data: existing } = await context.supabase
      .from("peminjaman").select("id")
      .eq("user_id", context.userId).eq("buku_id", data.buku_id)
      .in("status", ["menunggu", "disetujui", "dipinjam", "terlambat"]);
    if (existing && existing.length) throw new Error("Anda sudah memiliki pengajuan/pinjaman aktif untuk buku ini.");

    const { data: row, error } = await context.supabase
      .from("peminjaman")
      .insert({ user_id: context.userId, buku_id: data.buku_id, status: "menunggu" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const buatReservasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ buku_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // posisi antrian = jumlah menunggu + 1
    const { count } = await context.supabase
      .from("reservasi").select("id", { count: "exact", head: true })
      .eq("buku_id", data.buku_id).eq("status", "menunggu");
    const { data: row, error } = await context.supabase
      .from("reservasi")
      .insert({ user_id: context.userId, buku_id: data.buku_id, posisi_antrian: (count ?? 0) + 1 })
      .select("*").single();
    if (error) throw new Error(error.message.includes("reservasi_unik_menunggu") ? "Anda sudah memesan buku ini." : error.message);
    return row;
  });

export const batalkanReservasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reservasi").update({ status: "batal" })
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: PERSETUJUAN & PENGEMBALIAN =============
export const setujuiPeminjaman = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    peminjaman_id: z.string().uuid(),
    barcode: z.string().min(1),
    durasi_hari: z.number().int().min(1).max(60).default(7),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);

    const { data: p, error: e1 } = await context.supabase
      .from("peminjaman").select("*").eq("id", data.peminjaman_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!p) throw new Error("Pengajuan tidak ditemukan.");
    if (p.status !== "menunggu") throw new Error("Pengajuan sudah diproses.");

    // Cari eksemplar berdasar barcode & buku_id
    const { data: eks, error: e2 } = await context.supabase
      .from("eksemplar").select("*").eq("barcode_value", data.barcode).maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!eks) throw new Error("Barcode eksemplar tidak dikenali.");
    if (p.buku_id && eks.buku_id !== p.buku_id) throw new Error("Eksemplar tidak sesuai dengan buku yang diajukan.");
    if (eks.status !== "tersedia") throw new Error(`Eksemplar sedang berstatus "${eks.status}".`);

    const now = new Date();
    const tempo = new Date(now.getTime() + data.durasi_hari * 86400000);

    const { error: e3 } = await context.supabase.from("peminjaman").update({
      status: "dipinjam",
      eksemplar_id: eks.id,
      buku_id: eks.buku_id,
      disetujui_oleh: context.userId,
      durasi_hari: data.durasi_hari,
      tanggal_pinjam: now.toISOString(),
      tanggal_jatuh_tempo: tempo.toISOString(),
    }).eq("id", p.id);
    if (e3) throw new Error(e3.message);

    const { error: e4 } = await context.supabase.from("eksemplar")
      .update({ status: "dipinjam" }).eq("id", eks.id);
    if (e4) throw new Error(e4.message);

    return { ok: true };
  });

export const tolakPeminjaman = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ peminjaman_id: z.string().uuid(), catatan: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("peminjaman")
      .update({ status: "ditolak", catatan: data.catatan ?? null, disetujui_oleh: context.userId })
      .eq("id", data.peminjaman_id).eq("status", "menunggu");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const kembalikanBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ barcode: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { data: eks, error: e1 } = await context.supabase
      .from("eksemplar").select("*").eq("barcode_value", data.barcode).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!eks) throw new Error("Barcode tidak dikenali.");

    const { data: p, error: e2 } = await context.supabase
      .from("peminjaman").select("*").eq("eksemplar_id", eks.id)
      .in("status", ["dipinjam", "terlambat"])
      .order("tanggal_pinjam", { ascending: false }).limit(1).maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!p) throw new Error("Tidak ada peminjaman aktif untuk eksemplar ini.");

    const { error: e3 } = await context.supabase.from("peminjaman")
      .update({ status: "dikembalikan", tanggal_kembali: new Date().toISOString() })
      .eq("id", p.id);
    if (e3) throw new Error(e3.message);

    // Eksemplar tersedia lagi → trigger DB akan memicu promosi reservasi
    const { error: e4 } = await context.supabase.from("eksemplar")
      .update({ status: "tersedia" }).eq("id", eks.id);
    if (e4) throw new Error(e4.message);

    // Ambil denda (jika ada)
    const { data: denda } = await context.supabase
      .from("denda").select("*").eq("peminjaman_id", p.id).maybeSingle();
    return { ok: true, denda };
  });

// ============= STAFF: DENDA =============
export const bayarDenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("denda")
      .update({ status: "lunas", dilunasi_oleh: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bebaskanDenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), catatan: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("denda")
      .update({ status: "dibebaskan", dibebaskan_oleh: context.userId, catatan: data.catatan ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: INVENTARIS =============
const bukuSchema = z.object({
  id: z.string().uuid().optional(),
  kode_buku: z.string().min(1),
  judul: z.string().min(1),
  pengarang: z.string().optional().nullable(),
  penerbit: z.string().optional().nullable(),
  tahun_terbit: z.number().int().optional().nullable(),
  isbn: z.string().optional().nullable(),
  kategori: z.string().optional().nullable(),
  lokasi_rak: z.string().optional().nullable(),
  deskripsi: z.string().optional().nullable(),
});

export const simpanBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bukuSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    if (data.id) {
      const { error } = await context.supabase.from("buku").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase.from("buku").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const hapusBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("buku").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const tambahEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    buku_id: z.string().uuid(),
    jumlah: z.number().int().min(1).max(50),
    prefix: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    // Cari nomor mulai berikutnya
    const { count } = await context.supabase
      .from("eksemplar").select("id", { count: "exact", head: true }).eq("buku_id", data.buku_id);
    const start = (count ?? 0) + 1;
    const rows = Array.from({ length: data.jumlah }, (_, i) => {
      const kode = `${data.prefix}-${String(start + i).padStart(4, "0")}`;
      return { buku_id: data.buku_id, kode_eksemplar: kode, barcode_value: kode, status: "tersedia" as const };
    });
    const { error } = await context.supabase.from("eksemplar").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, added: rows.length };
  });

export const ubahStatusEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["tersedia","dipinjam","dipesan","hilang","rusak"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("eksemplar").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hapusEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("eksemplar").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: PENGATURAN =============
export const simpanPengaturan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    tarif_per_hari: z.number().min(0),
    grace_days: z.number().int().min(0).max(30),
    max_denda: z.number().min(0).nullable(),
    batas_ambil_reservasi_jam: z.number().int().min(1).max(240),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase.from("pengaturan_denda")
      .update({ ...data, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: MANUAL SWEEP KETERLAMBATAN =============
export const jalankanSweepTerlambat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin.rpc("tandai_peminjaman_terlambat");
    const { data: b } = await supabaseAdmin.rpc("expire_reservasi_lewat");
    return { diperiksa: a ?? 0, reservasi_kadaluarsa: b ?? 0 };
  });
