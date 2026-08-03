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
    const eks = await cariEksemplarDariScan(context.supabase, data.barcode);
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
  // Kode eksemplar/barcode awal yang diketik petugas (mis. "240010001").
  // Eksemplar dibuat mengikuti nilai ini, bukan kode buku otomatis.
  kode_eksemplar_awal: z.string().trim().min(1).max(64).optional().nullable(),
});

/**
 * Buat deretan kode eksemplar mulai dari kode yang diinput petugas.
 * "240010001" -> 240010001, 240010002, ...  ("A/12" -> "A/12", "A/13").
 * Bila tidak ada angka di akhir, tambahkan sufiks -0002 dst.
 */
function deretKodeEksemplar(awal: string, jumlah: number): string[] {
  const base = awal.trim();
  const m = base.match(/^(.*?)(\d+)$/);
  if (!m) return Array.from({ length: jumlah }, (_, i) => (i === 0 ? base : `${base}-${String(i + 1).padStart(4, "0")}`));
  const [, prefix, angka] = m;
  const lebar = angka.length;
  const mulai = Number(angka);
  return Array.from(
    { length: jumlah },
    (_, i) => `${prefix}${String(mulai + i).padStart(lebar, "0")}`,
  );
}

export const simpanBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bukuSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { id, jumlah_eksemplar, meta, kode_buku, kode_eksemplar_awal, ...sisa } = data;
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
    // Kode mengikuti "Kode Barcot / Eksemplar" yang diinput petugas bila ada.
    const awal = kode_eksemplar_awal?.trim();
    const jml = jumlah_eksemplar && jumlah_eksemplar > 0 ? jumlah_eksemplar : awal ? 1 : 0;
    if (jml > 0) {
      const kodeList = awal
        ? deretKodeEksemplar(awal, jml)
        : Array.from({ length: jml }, (_, i) => `${kodeFinal}-${String(i + 1).padStart(4, "0")}`);
      const eks = kodeList.map((kode) => ({
        buku_id: row.id,
        kode_eksemplar: kode,
        barcode_value: kode,
        status: "tersedia" as const,
      }));
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Soft delete + pastikan berhasil (bypass RLS pakai admin).
    const { data: updated, error } = await (supabaseAdmin.from("buku") as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Buku tidak ditemukan atau sudah dihapus.");
    return { ok: true };
  });

// Tambah 1 eksemplar baru ke buku yang sudah ada dengan barcode manual.
// Dipakai oleh tab "Dari Buku yang Ada" saat menambah salinan buku.
export const tambahEksemplarSatu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        buku_id: z.string().uuid(),
        barcode: z.string().trim().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const barcode = data.barcode.trim();
    // Cek duplikat barcode
    const { data: dup } = await context.supabase
      .from("eksemplar")
      .select("id")
      .eq("barcode_value", barcode)
      .maybeSingle();
    if (dup) throw new Error(`Barcode "${barcode}" sudah dipakai eksemplar lain.`);
    const { error } = await context.supabase.from("eksemplar").insert({
      buku_id: data.buku_id,
      kode_eksemplar: barcode,
      barcode_value: barcode,
      status: "tersedia" as const,
    });
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

// Pastikan bucket 'sampul' ada sebelum mengunggah foto. Service role boleh
// membuat bucket, jadi tak perlu langkah manual. Error "sudah ada" diabaikan.
// Catatan: policy tulis (RLS) tetap berasal dari migrasi katalog; ini hanya
// menjamin bucket-nya ada.
export const pastikanBucketSampul = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.createBucket("sampul", { public: true });
    if (error && !/exist|already/i.test(error.message)) {
      return { ok: false, note: error.message };
    }
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
  meta: z.record(z.string(), z.string()).nullish(),
  sampul_path: z.string().nullish(),
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
    const db = supabaseAdmin as any;

    // Semua operasi DIBUAT SET-BASED (bulk) — hanya beberapa query per batch,
    // apa pun jumlah barisnya. Ini menghindari batas subrequest Cloudflare
    // Workers yang membuat impor besar (mis. 1500+ baris) gagal di tengah.

    const norm = (s: string | null | undefined) =>
      (s || "").toLowerCase().trim().replace(/\s+/g, " ");
    const rowKey = (r: (typeof data.rows)[number]) =>
      r.isbn && r.isbn.trim() ? `isbn:${norm(r.isbn)}` : `jp:${norm(r.judul)}|${norm(r.pengarang)}`;

    // Query .in() dipecah agar URL/pernyataan tidak kepanjangan.
    const chunkIn = async (
      table: string,
      col: string,
      select: string,
      vals: string[],
    ): Promise<any[]> => {
      const out: any[] = [];
      const uniq = [...new Set(vals)].filter(Boolean);
      for (let i = 0; i < uniq.length; i += 100) {
        const slice = uniq.slice(i, i + 100);
        if (!slice.length) continue;
        const { data: rows, error } = await db.from(table).select(select).in(col, slice);
        if (error) throw new Error(`Gagal membaca ${table}: ${error.message}`);
        if (rows) out.push(...rows);
      }
      return out;
    };

    // 1) Kelompokkan baris → satu buku per grup, satu eksemplar per baris.
    const groups = new Map<string, typeof data.rows>();
    for (const r of data.rows) {
      const k = rowKey(r);
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }

    // 2) Ambil buku yang sudah ada (by isbn / kode_buku / judul) — set-based.
    const existingByKey = new Map<string, string>(); // rowKey → buku_id
    const existingByKode = new Map<string, string>(); // kode_buku → buku_id
    const kodeById = new Map<string, string>(); // buku_id → kode_buku (yang di DB)
    const found = [
      ...(await chunkIn(
        "buku",
        "isbn",
        "id, kode_buku, isbn, judul, pengarang",
        data.rows.map((r) => r.isbn).filter(Boolean) as string[],
      )),
      ...(await chunkIn(
        "buku",
        "kode_buku",
        "id, kode_buku, isbn, judul, pengarang",
        data.rows.map((r) => r.kode_buku),
      )),
      ...(await chunkIn(
        "buku",
        "judul",
        "id, kode_buku, isbn, judul, pengarang",
        data.rows.map((r) => r.judul),
      )),
    ];
    for (const b of found) {
      if (b.isbn) existingByKey.set(`isbn:${norm(b.isbn)}`, b.id);
      existingByKey.set(`jp:${norm(b.judul)}|${norm(b.pengarang)}`, b.id);
      existingByKode.set(b.kode_buku, b.id);
      kodeById.set(b.id, b.kode_buku);
    }

    const buatPayload = (rows: typeof data.rows) => {
      const first = rows[0];
      return {
        kode_buku: first.kode_buku,
        judul: first.judul,
        pengarang: first.pengarang ?? null,
        penerbit: first.penerbit ?? null,
        tahun_terbit: first.tahun_terbit ?? null,
        isbn: first.isbn ?? null,
        kategori: first.kategori ?? null,
        lokasi_rak: first.lokasi_rak ?? null,
        deskripsi: first.deskripsi ?? null,
        sampul_path: first.sampul_path ?? null,
        meta: first.meta ?? {},
      };
    };

    // 3) Pisahkan grup: baru vs sudah ada. Dedup kode_buku antar-grup di batch.
    type Grp = { rows: typeof data.rows; id?: string };
    const baruGrp: Grp[] = [];
    const adaGrp: Grp[] = [];
    const kodeDipakai = new Set(existingByKode.keys());
    for (const [key, rows] of groups.entries()) {
      const id = existingByKey.get(key) ?? existingByKode.get(rows[0].kode_buku);
      if (id) {
        adaGrp.push({ rows, id });
      } else {
        let kode = rows[0].kode_buku;
        let n = 1;
        while (kodeDipakai.has(kode)) kode = `${rows[0].kode_buku}-${n++}`;
        kodeDipakai.add(kode);
        rows[0] = { ...rows[0], kode_buku: kode };
        baruGrp.push({ rows });
      }
    }

    let inserted = 0,
      updated = 0,
      skipped = 0,
      eksemplarDibuat = 0;

    // 4) Bulk upsert buku BARU (konflik kode_buku), ambil id-nya kembali.
    for (let i = 0; i < baruGrp.length; i += 300) {
      const slice = baruGrp.slice(i, i + 300);
      const { data: ins, error } = await db
        .from("buku")
        .upsert(slice.map((g) => buatPayload(g.rows)), { onConflict: "kode_buku" })
        .select("id, kode_buku");
      if (error) throw new Error(`Gagal menyimpan buku baru: ${error.message}`);
      const idByKode = new Map<string, string>((ins ?? []).map((b: any) => [b.kode_buku, b.id]));
      for (const g of slice) {
        const id = idByKode.get(g.rows[0].kode_buku);
        if (id) {
          g.id = id;
          inserted++;
        }
      }
    }

    // 5) Bulk update buku yang SUDAH ADA (hanya overwrite). Dedup per id;
    //    kode_buku dipertahankan apa adanya (tidak ditimpa dari file).
    if (adaGrp.length && data.mode === "overwrite") {
      const byId = new Map<string, any>();
      for (const g of adaGrp) {
        byId.set(g.id!, {
          id: g.id!,
          ...buatPayload(g.rows),
          kode_buku: kodeById.get(g.id!) ?? g.rows[0].kode_buku,
          deleted_at: null,
        });
      }
      const payloads = [...byId.values()];
      for (let i = 0; i < payloads.length; i += 300) {
        const slice = payloads.slice(i, i + 300);
        const { error } = await db.from("buku").upsert(slice, { onConflict: "id" });
        if (error) throw new Error(`Gagal memperbarui buku: ${error.message}`);
      }
      updated = byId.size;
    } else if (adaGrp.length) {
      skipped = new Set(adaGrp.map((g) => g.id)).size;
    }

    // 6) Susun eksemplar (1 per baris), buang barcode yang sudah ada di DB.
    const semuaGrp = [...baruGrp, ...adaGrp].filter((g) => g.id);
    const barcodeSet = new Set<string>();
    const eksCandidates: { buku_id: string; barcode: string }[] = [];
    for (const g of semuaGrp) {
      g.rows.forEach((r, i) => {
        const barcode =
          (r.barcode_value && r.barcode_value.trim()) ||
          `${g.rows[0].kode_buku}-${String(i + 1).padStart(4, "0")}`;
        if (barcodeSet.has(barcode)) return; // dedup di dalam batch
        barcodeSet.add(barcode);
        eksCandidates.push({ buku_id: g.id!, barcode });
      });
    }
    const adaBarcode = new Set<string>(
      (await chunkIn("eksemplar", "barcode_value", "barcode_value", [...barcodeSet])).map(
        (e) => e.barcode_value,
      ),
    );
    const eksRows = eksCandidates
      .filter((e) => !adaBarcode.has(e.barcode))
      .map((e) => ({
        buku_id: e.buku_id,
        kode_eksemplar: e.barcode,
        barcode_value: e.barcode,
        status: "tersedia" as const,
      }));
    for (let i = 0; i < eksRows.length; i += 300) {
      const slice = eksRows.slice(i, i + 300);
      const { error } = await db.from("eksemplar").insert(slice);
      if (!error) eksemplarDibuat += slice.length;
    }

    return { inserted, updated, skipped, eksemplarDibuat };
  });

// ── Tambah mahasiswa cepat dari dasbor petugas ──────────────────────────────
// Membuat akun auth + profil mahasiswa (nama, NIM, prodi). Hanya staf.
const mahasiswaFields = z.object({
  nama: z.string().trim().min(3),
  nim: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/),
  prodi: z.string().trim().min(2),
  tempat_lahir: z.string().trim().optional().nullable(),
  tanggal_lahir: z.string().trim().optional().nullable(),
  alamat: z.string().trim().optional().nullable(),
  no_telp: z.string().trim().optional().nullable(),
});

export const tambahMahasiswa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => mahasiswaFields.parse(d))
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

    // Mahasiswa sekarang data saja — tetap butuh auth user karena FK profiles.id → auth.users.id.
    // Sandi acak tidak pernah ditampilkan; mahasiswa tidak login.
    const email = `${data.nim}@mhs.fisip.ulm.ac.id`;
    const sandi = `Fisip-${data.nim}-${Math.random().toString(36).slice(2, 10)}`;
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: sandi,
      email_confirm: true,
      user_metadata: { nama: data.nama },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Gagal membuat data mahasiswa.");

    const { error: pErr } = await (supabaseAdmin.from("profiles") as any)
      .update({
        nama: data.nama,
        nim: data.nim,
        prodi: data.prodi,
        email,
        tempat_lahir: data.tempat_lahir || null,
        tanggal_lahir: data.tanggal_lahir || null,
        alamat: data.alamat || null,
        no_telp: data.no_telp || null,
        is_profile_completed: true,
      })
      .eq("id", created.user.id);
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(pErr.message);
    }

    return { id: created.user.id, nama: data.nama, nim: data.nim, prodi: data.prodi, email };
  });

export const ubahMahasiswa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => mahasiswaFields.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cek NIM unik (kecuali diri sendiri)
    const { data: dup } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("nim", data.nim)
      .neq("id", data.id)
      .maybeSingle();
    if (dup) throw new Error(`NIM ${data.nim} sudah dipakai mahasiswa lain.`);

    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({
        nama: data.nama,
        nim: data.nim,
        prodi: data.prodi,
        tempat_lahir: data.tempat_lahir || null,
        tanggal_lahir: data.tanggal_lahir || null,
        alamat: data.alamat || null,
        no_telp: data.no_telp || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hapusMahasiswa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cek apakah mahasiswa sedang meminjam
    const { data: pinjam } = await supabaseAdmin
      .from("peminjaman")
      .select("id")
      .eq("user_id", data.id)
      .in("status", ["dipinjam", "menunggu", "terlambat"])
      .limit(1);
    if (pinjam && pinjam.length) {
      throw new Error("Mahasiswa masih memiliki pinjaman aktif — kembalikan dulu.");
    }
    // Delete auth user → CASCADE delete profile
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
