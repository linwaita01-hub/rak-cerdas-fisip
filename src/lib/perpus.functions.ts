import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ============= Helper =============
async function ensureStaff(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hanya petugas yang dapat melakukan aksi ini.");
}

// ============= MAHASISWA: RESERVASI =============
export const buatReservasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ buku_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // posisi antrian = jumlah menunggu + 1
    const { count } = await context.supabase
      .from("reservasi")
      .select("id", { count: "exact", head: true })
      .eq("buku_id", data.buku_id)
      .eq("status", "menunggu");
    const { data: row, error } = await context.supabase
      .from("reservasi")
      .insert({ user_id: context.userId, buku_id: data.buku_id, posisi_antrian: (count ?? 0) + 1 })
      .select("*")
      .single();
    if (error)
      throw new Error(
        error.message.includes("reservasi_unik_menunggu")
          ? "Anda sudah memesan buku ini."
          : error.message,
      );
    return row;
  });

export const batalkanReservasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reservasi")
      .update({ status: "batal" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: PINJAM DI MEJA (scan) & PENGEMBALIAN =============
// Admin memindai eksemplar & memilih mahasiswa → buat permintaan berstatus
// 'menunggu' (eksemplar ditahan → 'dipesan'). Mahasiswa mengonfirmasi lewat
// RPC konfirmasi_peminjaman (migrasi 20260721130000_pinjam_meja_konfirmasi).
export const mulaiPeminjamanMeja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        barcode: z.string().min(1),
        user_id: z.string().uuid(),
        durasi_hari: z.number().int().min(1).max(60).default(7),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);

    // Mahasiswa harus ada & layak (tak ada denda belum lunas / terlambat).
    const { data: profil } = await context.supabase
      .from("profiles")
      .select("id, nama")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!profil) throw new Error("Mahasiswa tidak ditemukan.");
    const { data: layak } = await context.supabase.rpc("mahasiswa_layak_pinjam", {
      _user_id: data.user_id,
    });
    if (!layak) throw new Error("Mahasiswa memiliki denda belum lunas atau peminjaman terlambat.");

    // Cari eksemplar dari barcode.
    const { data: eks, error: e1 } = await context.supabase
      .from("eksemplar")
      .select("id, buku_id, status")
      .eq("barcode_value", data.barcode)
      .is("deleted_at", null)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!eks) throw new Error("Barcode eksemplar tidak dikenali.");

    // Tahan eksemplar secara atomik: tersedia → dipesan.
    const { data: held, error: eHold } = await context.supabase
      .from("eksemplar")
      .update({ status: "dipesan" })
      .eq("id", eks.id)
      .eq("status", "tersedia")
      .select("id");
    if (eHold) throw new Error(eHold.message);
    if (!held || held.length === 0)
      throw new Error(`Eksemplar sedang berstatus "${eks.status}", tidak bisa dipinjam.`);

    // Buat permintaan menunggu konfirmasi mahasiswa.
    const { data: row, error: e2 } = await context.supabase
      .from("peminjaman")
      .insert({
        user_id: data.user_id,
        buku_id: eks.buku_id,
        eksemplar_id: eks.id,
        status: "menunggu",
        durasi_hari: data.durasi_hari,
        disetujui_oleh: context.userId,
      })
      .select("id")
      .single();
    if (e2) {
      // Lepas tahanan bila gagal membuat baris.
      await context.supabase.from("eksemplar").update({ status: "tersedia" }).eq("id", eks.id);
      throw new Error(e2.message);
    }
    return { ok: true, peminjaman_id: row.id, nama: profil.nama };
  });

export const kembalikanBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ barcode: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { data: eks, error: e1 } = await context.supabase
      .from("eksemplar")
      .select("*")
      .eq("barcode_value", data.barcode)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!eks) throw new Error("Barcode tidak dikenali.");

    const { data: p, error: e2 } = await context.supabase
      .from("peminjaman")
      .select("*")
      .eq("eksemplar_id", eks.id)
      .in("status", ["dipinjam", "terlambat"])
      .order("tanggal_pinjam", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!p) throw new Error("Tidak ada peminjaman aktif untuk eksemplar ini.");

    const { error: e3 } = await context.supabase
      .from("peminjaman")
      .update({ status: "dikembalikan", tanggal_kembali: new Date().toISOString() })
      .eq("id", p.id);
    if (e3) throw new Error(e3.message);

    // Eksemplar tersedia lagi → trigger DB akan memicu promosi reservasi
    const { error: e4 } = await context.supabase
      .from("eksemplar")
      .update({ status: "tersedia" })
      .eq("id", eks.id);
    if (e4) throw new Error(e4.message);

    // Ambil denda (jika ada)
    const { data: denda } = await context.supabase
      .from("denda")
      .select("*")
      .eq("peminjaman_id", p.id)
      .maybeSingle();
    return { ok: true, denda };
  });

// ============= STAFF: DENDA =============
export const bayarDenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("denda")
      .update({ status: "lunas", dilunasi_oleh: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bebaskanDenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), catatan: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("denda")
      .update({
        status: "dibebaskan",
        dibebaskan_oleh: context.userId,
        catatan: data.catatan ?? null,
      })
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
  sampul_path: z.string().optional().nullable(),
  // Kolom lengkap (No. Inventaris, Editor, Klasifikasi, Subjek, Sumber, dll.)
  // disimpan fleksibel di meta. Dikirim hanya bila ada isinya.
  meta: z.record(z.string(), z.string()).optional().nullable(),
  // Untuk buku baru: langsung buat sejumlah eksemplar.
  jumlah_eksemplar: z.number().int().min(0).max(500).optional().nullable(),
});

export const simpanBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bukuSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { id, jumlah_eksemplar, meta, ...rest } = data;
    // Hanya sertakan meta bila terisi (agar tetap jalan sebelum migrasi kolom meta).
    const payload = meta && Object.keys(meta).length > 0 ? { ...rest, meta } : { ...rest };

    if (id) {
      const { error } = await context.supabase.from("buku").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase
      .from("buku")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Buat eksemplar awal untuk buku baru.
    if (jumlah_eksemplar && jumlah_eksemplar > 0) {
      const eks = Array.from({ length: jumlah_eksemplar }, (_, i) => {
        const kode = `${rest.kode_buku}-${String(i + 1).padStart(4, "0")}`;
        return {
          buku_id: row.id,
          kode_eksemplar: kode,
          barcode_value: kode,
          status: "tersedia" as const,
        };
      });
      const { error: eErr } = await context.supabase.from("eksemplar").insert(eks);
      if (eErr) throw new Error("Buku tersimpan, tapi gagal membuat eksemplar: " + eErr.message);
    }
    return { ok: true, id: row.id };
  });

export const hapusBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("buku")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const tambahEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        buku_id: z.string().uuid(),
        jumlah: z.number().int().min(1).max(50),
        prefix: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    // Cari nomor mulai berikutnya
    const { count } = await context.supabase
      .from("eksemplar")
      .select("id", { count: "exact", head: true })
      .eq("buku_id", data.buku_id);
    const start = (count ?? 0) + 1;
    const rows = Array.from({ length: data.jumlah }, (_, i) => {
      const kode = `${data.prefix}-${String(start + i).padStart(4, "0")}`;
      return {
        buku_id: data.buku_id,
        kode_eksemplar: kode,
        barcode_value: kode,
        status: "tersedia" as const,
      };
    });
    const { error } = await context.supabase.from("eksemplar").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, added: rows.length };
  });

export const ubahStatusEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["tersedia", "dipinjam", "dipesan", "hilang", "rusak"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("eksemplar")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hapusEksemplar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("eksemplar")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: PENGATURAN =============
export const simpanPengaturan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tarif_per_hari: z.number().min(0),
        grace_days: z.number().int().min(0).max(30),
        max_denda: z.number().min(0).nullable(),
        batas_ambil_reservasi_jam: z.number().int().min(1).max(240),
        purge_hari: z.number().int().min(1).max(3650),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { error } = await context.supabase
      .from("pengaturan_denda")
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

// ============= STAFF: TRASH / RIWAYAT (proxy ke RPC SECURITY DEFINER) =============
export const pulihkanBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("pulihkan_buku", { _buku_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hapusPermanenBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("hapus_permanen_buku", { _buku_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const kembalikanVersiBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ history_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("kembalikan_versi_buku", { _history_id: data.history_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= STAFF: IMPOR MASSAL =============
const imporRow = z.object({
  kode_buku: z.string().min(1),
  barcode_value: z.string().nullish(),
  judul: z.string().min(1),
  pengarang: z.string().nullish(),
  penerbit: z.string().nullish(),
  tahun_terbit: z.number().int().nullish(),
  isbn: z.string().nullish(),
  kategori: z.string().nullish(),
  lokasi_rak: z.string().nullish(),
  deskripsi: z.string().nullish(),
  jumlah_eksemplar: z.number().int().min(0).max(200).nullish(),
  meta: z.record(z.string(), z.string()).nullish(),
});

export const imporBukuMassal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mode: z.enum(["skip", "overwrite"]),
        rows: z.array(imporRow).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ambil daftar kode_buku yg sudah ada
    const kodes = data.rows.map((r) => r.kode_buku);
    const { data: existing } = await supabaseAdmin
      .from("buku")
      .select("id, kode_buku")
      .in("kode_buku", kodes);
    const existingMap = new Map((existing ?? []).map((b) => [b.kode_buku, b.id]));

    let inserted = 0,
      updated = 0,
      skipped = 0,
      eksemplarDibuat = 0;

    for (const r of data.rows) {
      const payload = {
        kode_buku: r.kode_buku,
        judul: r.judul,
        pengarang: r.pengarang ?? null,
        penerbit: r.penerbit ?? null,
        tahun_terbit: r.tahun_terbit ?? null,
        isbn: r.isbn ?? null,
        kategori: r.kategori ?? null,
        lokasi_rak: r.lokasi_rak ?? null,
        deskripsi: r.deskripsi ?? null,
        meta: r.meta ?? {},
      };
      const existingId = existingMap.get(r.kode_buku);
      let bukuId: string | undefined;
      let created = false;
      if (existingId) {
        if (data.mode === "skip") {
          skipped++;
          continue;
        }
        const { error } = await (supabaseAdmin.from("buku") as any)
          .update({ ...payload, deleted_at: null })
          .eq("id", existingId);
        if (error) throw new Error(`Gagal update ${r.kode_buku}: ${error.message}`);
        bukuId = existingId;
        updated++;
      } else {
        const { data: ins, error } = await (supabaseAdmin.from("buku") as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(`Gagal insert ${r.kode_buku}: ${error.message}`);
        bukuId = ins.id;
        inserted++;
        created = true;
      }

      // Buat eksemplar hanya untuk buku baru
      if (created && bukuId && r.jumlah_eksemplar && r.jumlah_eksemplar > 0) {
        const rows = Array.from({ length: r.jumlah_eksemplar }, (_, i) => {
          const kode = `${r.kode_buku}-${String(i + 1).padStart(4, "0")}`;
          // Eksemplar pertama pakai barcode asli dari file bila ada; sisanya generate.
          const barcode = i === 0 && r.barcode_value ? r.barcode_value : kode;
          return {
            buku_id: bukuId!,
            kode_eksemplar: kode,
            barcode_value: barcode,
            status: "tersedia" as const,
          };
        });
        const { error: eErr } = await supabaseAdmin.from("eksemplar").insert(rows);
        if (!eErr) eksemplarDibuat += rows.length;
      }
    }

    return { inserted, updated, skipped, eksemplarDibuat };
  });
