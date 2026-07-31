import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { cariEksemplarDariScan } from "@/lib/barcode-lookup";


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
// Admin memindai eksemplar & memilih mahasiswa → peminjaman LANGSUNG aktif
// (status 'dipinjam', eksemplar 'dipinjam', jatuh tempo dihitung). Tidak ada
// tahap konfirmasi mahasiswa: petugas yang bertanggung jawab menverifikasi
// identitas di meja.
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

    // Cari eksemplar dari barcode (toleran spasi/kapital & kode buku).
    const eks = await cariEksemplarDariScan(context.supabase, data.barcode);
    if (!eks) throw new Error("Barcode eksemplar tidak dikenali.");


    // Kunci eksemplar secara atomik: tersedia → dipinjam.
    const { data: held, error: eHold } = await context.supabase
      .from("eksemplar")
      .update({ status: "dipinjam" })
      .eq("id", eks.id)
      .eq("status", "tersedia")
      .select("id");
    if (eHold) throw new Error(eHold.message);
    if (!held || held.length === 0)
      throw new Error(`Eksemplar sedang berstatus "${eks.status}", tidak bisa dipinjam.`);

    // Buat baris peminjaman aktif dengan jatuh tempo.
    const now = new Date();
    const jatuhTempo = new Date(now.getTime() + data.durasi_hari * 86400000);
    const { data: row, error: e2 } = await context.supabase
      .from("peminjaman")
      .insert({
        user_id: data.user_id,
        buku_id: eks.buku_id,
        eksemplar_id: eks.id,
        status: "dipinjam",
        durasi_hari: data.durasi_hari,
        disetujui_oleh: context.userId,
        tanggal_pinjam: now.toISOString(),
        tanggal_jatuh_tempo: jatuhTempo.toISOString(),
      })
      .select("id")
      .single();
    if (e2) {
      // Kembalikan status eksemplar bila gagal membuat baris.
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
// Kode buku dibuat otomatis (tersembunyi dari petugas). Pola: BK-YYMM-XXXXX.
function buatKodeBuku(): string {
  const d = new Date();
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0");
  const acak = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `BK-${yymm}-${acak}`;
}

const bukuSchema = z.object({
  id: z.string().uuid().optional(),
  // Opsional: bila kosong, server membuatnya otomatis.
  kode_buku: z.string().min(1).optional().nullable(),
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
    const { id, jumlah_eksemplar, meta, kode_buku, ...sisa } = data;
    const rest = { ...sisa };
    // Hanya sertakan meta bila terisi (agar tetap jalan sebelum migrasi kolom meta).
    const dasar = meta && Object.keys(meta).length > 0 ? { ...rest, meta } : { ...rest };

    if (id) {
      // Saat mengubah: jangan menimpa kode_buku bila tidak dikirim.
      const payload = kode_buku ? { ...dasar, kode_buku } : dasar;
      const { error } = await context.supabase.from("buku").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }

    // Buat baru: kode_buku dibuat otomatis bila tidak dikirim; ulangi bila
    // kebetulan bentrok dengan kode yang sudah ada (unique violation 23505).
    let kodeFinal = kode_buku?.trim() || buatKodeBuku();
    let row: { id: string } | null = null;
    for (let coba = 0; coba < 5; coba++) {
      const res = await context.supabase
        .from("buku")
        .insert({ ...dasar, kode_buku: kodeFinal })
        .select("id")
        .single();
      if (!res.error) {
        row = res.data;
        break;
      }
      const bentrok = res.error.code === "23505";
      if (!bentrok) throw new Error(res.error.message);
      if (kode_buku) throw new Error(`Kode buku "${kodeFinal}" sudah dipakai.`);
      kodeFinal = buatKodeBuku(); // hanya kode otomatis yang boleh diganti
    }
    if (!row) throw new Error("Gagal membuat kode buku unik. Coba lagi.");

    // Buat eksemplar awal untuk buku baru.
    if (jumlah_eksemplar && jumlah_eksemplar > 0) {
      const eks = Array.from({ length: jumlah_eksemplar }, (_, i) => {
        const kode = `${kodeFinal}-${String(i + 1).padStart(4, "0")}`;
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
    const { error } = await supabaseAdmin.rpc("kembalikan_versi_buku", {
      _history_id: data.history_id,
    });
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

// ── Tambah mahasiswa cepat dari dasbor petugas ──────────────────────────────
// Membuat akun auth + profil mahasiswa (nama, NIM, prodi). Hanya staf.
export const tambahMahasiswa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nama: z.string().trim().min(3),
        nim: z
          .string()
          .trim()
          .regex(/^\d{6,15}$/),
        prodi: z.string().trim().min(2),
        email: z.string().trim().email().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: staf, error: sErr } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (sErr) throw new Error(sErr.message);
    if (!staf) throw new Error("Hanya petugas yang dapat menambah mahasiswa.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dup } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("nim", data.nim)
      .maybeSingle();
    if (dup) throw new Error(`NIM ${data.nim} sudah terdaftar.`);

    const email = data.email?.trim() || `${data.nim}@mhs.fisip.ulm.ac.id`;
    const sandi = `Fisip-${data.nim}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: sandi,
      email_confirm: true,
      user_metadata: { nama: data.nama },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Gagal membuat akun.");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        nama: data.nama,
        nim: data.nim,
        prodi: data.prodi,
        email,
        is_profile_completed: true,
      })
      .eq("id", created.user.id);
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(pErr.message);
    }

    return { id: created.user.id, nama: data.nama, nim: data.nim, prodi: data.prodi, email, sandi };
  });
