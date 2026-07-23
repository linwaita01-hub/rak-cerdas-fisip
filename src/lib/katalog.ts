import { supabase } from "@/integrations/supabase/client";

// Baris buku untuk katalog (kolom typed + kolom fleksibel di `meta`).
export type BukuKatalog = {
  id: string;
  kode_buku: string | null;
  judul: string | null;
  pengarang: string | null;
  penerbit: string | null;
  tahun_terbit: number | null;
  isbn: string | null;
  kategori: string | null;
  deskripsi: string | null;
  lokasi_rak: string | null;
  sampul_path: string | null;
  meta?: Record<string, unknown> | null;
  eksemplar?: { status: string | null }[] | null;
};

// Kolom yang di-select untuk katalog. `*` menyertakan `meta` (bila kolomnya
// sudah ada di DB) tanpa membuat query gagal saat kolomnya belum diterapkan.
export const SELECT_KATALOG = "*, eksemplar(status)";

const m = (b: BukuKatalog, key: string): string | null => {
  const v = (b.meta as Record<string, unknown> | undefined | null)?.[key];
  if (v === undefined || v === null || v === "") return null;
  return String(v);
};

// Kolom lengkap mengikuti struktur "sheet 7 tina". Ambil dari kolom typed bila
// ada, jika tidak dari `meta`. Kunci meta yang dipakai dicatat di META_DIKENAL
// agar sisa meta bisa ditampilkan terpisah tanpa duplikasi.
export const META_DIKENAL = [
  "pengarang_tambahan",
  "editor",
  "edisi",
  "tempat_terbit",
  "klasifikasi",
  "no_panggil",
  "subjek",
  "kata_kunci",
  "bentuk_fisik",
  "deskripsi_fisik",
  "bahasa",
  "jenis_koleksi",
  "kode_inventaris",
  "foto",
];

export const KOLOM_KATALOG: { label: string; get: (b: BukuKatalog) => string | null }[] = [
  { label: "Kode buku", get: (b) => b.kode_buku },
  { label: "Judul", get: (b) => b.judul },
  { label: "Pengarang", get: (b) => b.pengarang },
  { label: "Pengarang tambahan", get: (b) => m(b, "pengarang_tambahan") },
  { label: "Editor", get: (b) => m(b, "editor") },
  { label: "Edisi / cetakan", get: (b) => m(b, "edisi") },
  { label: "Penerbit", get: (b) => b.penerbit },
  { label: "Tempat terbit", get: (b) => m(b, "tempat_terbit") },
  { label: "Tahun terbit", get: (b) => (b.tahun_terbit != null ? String(b.tahun_terbit) : null) },
  { label: "ISBN / ISSN", get: (b) => b.isbn },
  { label: "Klasifikasi", get: (b) => m(b, "klasifikasi") ?? b.kategori },
  { label: "No. panggil", get: (b) => m(b, "no_panggil") ?? b.lokasi_rak },
  { label: "Subjek", get: (b) => m(b, "subjek") },
  { label: "Kata kunci", get: (b) => m(b, "kata_kunci") },
  { label: "Bentuk fisik", get: (b) => m(b, "bentuk_fisik") },
  { label: "Deskripsi fisik", get: (b) => m(b, "deskripsi_fisik") },
  { label: "Bahasa", get: (b) => m(b, "bahasa") },
  { label: "Jenis koleksi", get: (b) => m(b, "jenis_koleksi") },
  { label: "No. inventaris", get: (b) => m(b, "kode_inventaris") },
  { label: "Lokasi rak", get: (b) => b.lokasi_rak },
  { label: "Deskripsi", get: (b) => b.deskripsi },
];

// URL foto sampul: dukung URL penuh (http) maupun path di bucket Storage 'sampul'.
export function fotoUrl(b: BukuKatalog): string | null {
  const raw = b.sampul_path || m(b, "foto");
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const { data } = supabase.storage.from("sampul").getPublicUrl(raw);
  return data.publicUrl;
}

// Sisa kolom di `meta` yang belum ditampilkan lewat KOLOM_KATALOG.
export function metaSisa(b: BukuKatalog): { key: string; value: string }[] {
  const meta = (b.meta as Record<string, unknown> | undefined | null) ?? {};
  return Object.entries(meta)
    .filter(([k, v]) => !META_DIKENAL.includes(k) && v !== null && v !== undefined && v !== "")
    .map(([key, value]) => ({ key, value: String(value) }));
}

export function ketersediaan(b: BukuKatalog): { tersedia: number; total: number } {
  const eks = b.eksemplar ?? [];
  return { tersedia: eks.filter((e) => e.status === "tersedia").length, total: eks.length };
}
