import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

// Semua operasi memakai context.supabase (RLS: hanya staf yang boleh menulis
// tabel buku/eksemplar). buku_history dicatat otomatis oleh trigger DB, dan
// updated_at dipakai untuk optimistic locking. Tidak butuh service_role.

async function ensureStaff(context: { supabase: SB; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hanya petugas yang dapat melakukan aksi ini.");
}

const rowSchema = z.object({
  _rowId: z.string(),
  id: z.string().uuid().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  kode_buku: z.string().trim().min(1, "Kode buku wajib diisi").max(120),
  judul: z.string().trim().min(1, "Judul wajib diisi").max(500),
  pengarang: z.string().trim().max(300).optional().nullable(),
  penerbit: z.string().trim().max(300).optional().nullable(),
  tahun_terbit: z.number().int().min(0).max(3000).optional().nullable(),
  isbn: z.string().trim().max(60).optional().nullable(),
  kategori: z.string().trim().max(200).optional().nullable(),
  lokasi_rak: z.string().trim().max(120).optional().nullable(),
  deskripsi: z.string().trim().max(4000).optional().nullable(),
  jumlah_eksemplar: z.number().int().min(0).max(2000).optional().nullable(),
});

// Menyesuaikan jumlah eksemplar aktif ke `target`.
// - Menambah: buat eksemplar baru (kode + barcode) melanjutkan penomoran.
// - Mengurangi: soft-delete HANYA eksemplar berstatus "tersedia".
//   Eksemplar yang sedang dipinjam/dipesan tidak pernah dihapus.
async function syncEksemplar(sb: SB, bukuId: string, kodeBuku: string, target: number) {
  const res = { dibuat: 0, dihapus: 0 };

  const { data: aktif, error: e1 } = await sb
    .from("eksemplar")
    .select("id,status")
    .eq("buku_id", bukuId)
    .is("deleted_at", null);
  if (e1) throw new Error("eksemplar: " + e1.message);
  const current = aktif?.length ?? 0;

  if (target > current) {
    // Hitung SEMUA eksemplar (termasuk soft-deleted) agar penomoran unik.
    const { count } = await sb
      .from("eksemplar")
      .select("id", { count: "exact", head: true })
      .eq("buku_id", bukuId);
    const start = (count ?? 0) + 1;
    const rows = Array.from({ length: target - current }, (_, i) => {
      const kode = `${kodeBuku}-${String(start + i).padStart(4, "0")}`;
      return {
        buku_id: bukuId,
        kode_eksemplar: kode,
        barcode_value: kode,
        status: "tersedia" as const,
      };
    });
    const { error } = await sb.from("eksemplar").insert(rows);
    if (error) throw new Error("eksemplar: " + error.message);
    res.dibuat = rows.length;
  } else if (target < current) {
    const bisaHapus = (aktif ?? []).filter((e) => e.status === "tersedia");
    const perlu = current - target;
    const idsHapus = bisaHapus.slice(0, perlu).map((e) => e.id);
    if (idsHapus.length) {
      const { error } = await sb
        .from("eksemplar")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", idsHapus);
      if (error) throw new Error("eksemplar: " + error.message);
      res.dihapus = idsHapus.length;
    }
    // Bila idsHapus < perlu, sisanya sedang dipinjam/dipesan → sengaja dibiarkan.
  }
  return res;
}

export const simpanEditorBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z.array(rowSchema).max(1000),
        deleteIds: z.array(z.string().uuid()).max(1000).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const sb = context.supabase;

    const hasil = {
      dibuat: 0,
      diperbarui: 0,
      dihapus: 0,
      eksemplarDibuat: 0,
      eksemplarDihapus: 0,
      konflik: [] as { _rowId: string; kode_buku: string }[],
      galat: [] as { _rowId: string; kode_buku: string; pesan: string }[],
    };

    // 1) Hapus (soft delete) ke tempat sampah
    if (data.deleteIds.length) {
      const { error } = await sb
        .from("buku")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", data.deleteIds);
      if (error) throw new Error("Gagal menghapus: " + error.message);
      hasil.dihapus = data.deleteIds.length;
    }

    // 2) Upsert baris
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
      };

      try {
        if (!r.id) {
          // CREATE
          const { data: ins, error } = await sb.from("buku").insert(payload).select("id").single();
          if (error) throw new Error(error.message);
          hasil.dibuat++;
          if (r.jumlah_eksemplar && r.jumlah_eksemplar > 0) {
            const c = await syncEksemplar(sb, ins.id, r.kode_buku, r.jumlah_eksemplar);
            hasil.eksemplarDibuat += c.dibuat;
            hasil.eksemplarDihapus += c.dihapus;
          }
        } else {
          // UPDATE dengan optimistic locking (cocokkan updated_at)
          let q = sb.from("buku").update(payload).eq("id", r.id);
          if (r.updated_at) q = q.eq("updated_at", r.updated_at);
          const { data: upd, error } = await q.select("id");
          if (error) throw new Error(error.message);
          if (!upd || upd.length === 0) {
            hasil.konflik.push({ _rowId: r._rowId, kode_buku: r.kode_buku });
            continue; // konflik → jangan sinkron eksemplar
          }
          hasil.diperbarui++;
          if (r.jumlah_eksemplar != null) {
            const c = await syncEksemplar(sb, r.id, r.kode_buku, r.jumlah_eksemplar);
            hasil.eksemplarDibuat += c.dibuat;
            hasil.eksemplarDihapus += c.dihapus;
          }
        }
      } catch (e) {
        hasil.galat.push({
          _rowId: r._rowId,
          kode_buku: r.kode_buku,
          pesan: e instanceof Error ? e.message : "Gagal",
        });
      }
    }

    return hasil;
  });
