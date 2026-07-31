import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Normalisasi hasil scan: scanner HID / kamera kerap menyisipkan spasi,
 * newline, karakter kontrol, atau tanda kutip. Huruf dibiarkan apa adanya,
 * pencocokan case-insensitive dilakukan di query.
 */
export function normalisasiBarcode(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function escapeLike(v: string) {
  return v.replace(/[%,()]/g, "");
}

export type EksemplarDitemukan = {
  id: string;
  buku_id: string;
  status: string;
  kode_eksemplar: string | null;
  barcode_value: string | null;
};

/**
 * Cari eksemplar dari hasil scan dengan beberapa strategi berurutan:
 * 1. barcode_value persis (case-insensitive)
 * 2. kode_eksemplar persis (case-insensitive)
 * 3. kode buku (label dicetak per-judul) → ambil eksemplar tersedia pertama
 */
export async function cariEksemplarDariScan(
  supabase: SupabaseClient<Database>,
  raw: string,
): Promise<EksemplarDitemukan | null> {
  const kode = normalisasiBarcode(raw);
  if (!kode) return null;
  const like = escapeLike(kode);
  const sel = "id, buku_id, status, kode_eksemplar, barcode_value";

  const { data: byBarcode } = await supabase
    .from("eksemplar")
    .select(sel)
    .or(`barcode_value.ilike.${like},kode_eksemplar.ilike.${like}`)
    .is("deleted_at", null)
    .limit(1);
  if (byBarcode && byBarcode.length > 0) return byBarcode[0] as EksemplarDitemukan;

  // Fallback: yang dipindai ternyata kode buku, bukan kode eksemplar.
  const { data: buku } = await supabase
    .from("buku")
    .select("id")
    .ilike("kode_buku", like)
    .is("deleted_at", null)
    .limit(1);
  const bukuId = buku?.[0]?.id;
  if (!bukuId) return null;

  const { data: eks } = await supabase
    .from("eksemplar")
    .select(sel)
    .eq("buku_id", bukuId)
    .is("deleted_at", null)
    .order("status", { ascending: true })
    .limit(20);
  if (!eks || eks.length === 0) return null;
  const tersedia = eks.find((e) => e.status === "tersedia");
  return (tersedia ?? eks[0]) as EksemplarDitemukan;
}
