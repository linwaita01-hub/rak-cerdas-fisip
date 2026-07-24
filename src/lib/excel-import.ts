import * as XLSX from "xlsx";

export type ImporRow = {
  kode_buku: string;
  barcode_value?: string | null;
  judul: string;
  pengarang?: string | null;
  penerbit?: string | null;
  tahun_terbit?: number | null;
  isbn?: string | null;
  kategori?: string | null;
  lokasi_rak?: string | null;
  deskripsi?: string | null;
  jumlah_eksemplar?: number | null;
  meta?: Record<string, string>;
  _sheet?: string;
  _row?: number;
  _error?: string;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// Sinonim header → field DB. Urutan penting: `barcode_value` didahulukan agar
// kolom "KODE BARCOT/BARCODE" tidak keburu diklaim `kode_buku` (yang punya
// sinonim greedy "kode"). Setiap kolom hanya dipetakan ke SATU field.
const MAP: Record<string, string[]> = {
  barcode_value: ["barcode", "kodebarcot", "nobarcode", "barcot", "barcod"],
  kode_buku: [
    "kodebuku",
    "kodeitem",
    "noinventaris",
    "noinv",
    "inventaris",
    "kodeinventaris",
    "inv",
    "id",
    "kode",
  ],
  judul: ["judul", "title"],
  pengarang: ["pengarang", "author", "penulis"],
  penerbit: ["penerbit", "namapenerbit", "publisher", "puhdisher"],
  tahun_terbit: ["tahunterbit", "tahun", "year"],
  isbn: ["isbn", "isbnissn"],
  kategori: ["jeniskoleksi", "jenis", "kategori", "subjek", "klasifikasi", "klass"],
  lokasi_rak: ["nopanggil", "lokasi", "kodelokasi", "rak"],
  deskripsi: ["deskripsi", "deskripsifisik", "keterangan"],
  // "eksemplar" SENGAJA tidak dipakai (kolom "Kode EKSEMPLAR" bukan jumlah).
  // Kolom "JDL" (jumlah judul) dilewati; yang dipakai adalah "EKS" (eksemplar).
  jumlah_eksemplar: [
    "jumlaheksemplar",
    "jumlahbuku",
    "jlhbuku",
    "jlheks",
    "jumlaheks",
    "eks",
    "jumlah",
    "jml",
    "volume",
    "satuan",
  ],
};

const ALL_HEADER_TOKENS = new Set(Object.values(MAP).flat());

function matchField(field: string, n: string, keys: string[]): boolean {
  // Kolom "JDL" = jumlah judul, bukan jumlah eksemplar → jangan dipetakan.
  if (field === "jumlah_eksemplar" && n.includes("jdl")) return false;
  return keys.some((k) => n === k || n.startsWith(k) || n.endsWith(k));
}

// Kolom yang tidak dipetakan ke field typed disimpan ke `meta` agar tidak ada
// informasi yang hilang. Header yang dikenal (struktur "sheet 7 tina") dipetakan
// ke kunci kanonik yang dipakai katalog (lihat katalog.ts META_DIKENAL); header
// lain memakai versi ringkas dirinya sendiri.
const META_SYN: Record<string, string[]> = {
  pengarang_tambahan: ["pengarangtambahan"],
  editor: ["editor"],
  edisi: ["edisi", "edisicetakan"],
  tempat_terbit: ["tempatterbit"],
  klasifikasi: ["klasifikasi", "klass"],
  no_panggil: ["nopanggil"],
  subjek: ["subjek"],
  bahasa: ["bahasa"],
  jenis_koleksi: ["jeniskoleksi"],
  kode_inventaris: ["kodeinventaris", "noinventaris"],
  foto: ["fotobuku", "foto", "sampul", "gambar"],
  bentuk_fisik: ["bentukfisik", "bentukfisikkoleksi", "bentukfisikkolkesi"],
  deskripsi_fisik: ["deskripsifisik"],
  kata_kunci: ["infodetailspesifik", "katakunci", "infodetail"],
};

function metaKey(hdr: string): string | null {
  const n = norm(hdr);
  if (!n) return null;
  for (const [key, syns] of Object.entries(META_SYN)) {
    if (syns.some((s) => n === s || n.startsWith(s))) return key;
  }
  const clean = hdr
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return clean || null;
}

function findHeaderRow(rows: unknown[][]): { headerIdx: number; header: string[] } | null {
  let best = { idx: -1, score: 0, header: [] as string[] };
  const scan = Math.min(rows.length, 15);
  for (let i = 0; i < scan; i++) {
    const row = rows[i] || [];
    const tokens = row.map(norm).filter(Boolean);
    if (tokens.length < 3) continue;
    const score = tokens.reduce((a, t) => a + (ALL_HEADER_TOKENS.has(t) ? 1 : 0), 0);
    if (score > best.score) best = { idx: i, score, header: row.map((c) => String(c ?? "")) };
  }
  if (best.score < 2) return null;
  return { headerIdx: best.idx, header: best.header };
}

// Bila baris berikut tampak sub-header (mis: "PERTAMA","DUA","JDL","EKS")
function isSubHeaderRow(row: unknown[]): boolean {
  if (!row) return false;
  const cells = row.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (cells.length === 0) return false;
  const looksHeader = cells.every((c) => c.length <= 25 && /[a-zA-Z]/.test(c) && !/\d{3,}/.test(c));
  return looksHeader && cells.length <= 8;
}

// Forward-fill sel kosong dengan nilai non-kosong sebelumnya (untuk sel gabungan
// pada header dua baris).
function forwardFill(row: unknown[]): string[] {
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < row.length; i++) {
    const v = String(row[i] ?? "").trim();
    if (v) last = v;
    out[i] = last;
  }
  return out;
}

// Gabungkan header + sub-header. Sel yang punya sub-label digabung dengan induk
// (forward-filled), mis. "PENERBIT"+"TAHUN" → tahun_terbit, "JLH BUKU"+"EKS".
// Sel tanpa sub-label memakai header aslinya (agar kolom mandiri tetap benar).
function mergeHeader(headerRow: unknown[], subRow: unknown[]): string[] {
  const parent = forwardFill(headerRow);
  const len = Math.max(headerRow.length, subRow.length);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const sub = String(subRow[i] ?? "").trim();
    const own = String(headerRow[i] ?? "").trim();
    out[i] = sub ? `${parent[i] ?? ""} ${sub}`.trim() : own;
  }
  return out;
}

function buildColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const usedCol = new Set<number>();
  header.forEach((h, idx) => {
    if (usedCol.has(idx)) return;
    const n = norm(h);
    if (!n) return;
    for (const [field, keys] of Object.entries(MAP)) {
      if (map[field] !== undefined) continue;
      if (matchField(field, n, keys)) {
        map[field] = idx;
        usedCol.add(idx);
        break; // satu kolom → satu field
      }
    }
  });
  return map;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}
function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type SheetPreview = {
  sheetName: string;
  totalBaris: number;
  headerIdx: number;
  header: string[];
  columnMap: Record<string, number>;
  rows: ImporRow[];
  errorCount: number;
};

export async function parseExcelFile(file: File): Promise<{ sheets: SheetPreview[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: SheetPreview[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as unknown[][];
    if (!rows.length) continue;
    const found = findHeaderRow(rows);
    if (!found) continue;

    // Header dua baris: gabungkan header + sub-header, data mulai setelahnya.
    let dataStart = found.headerIdx + 1;
    let effectiveHeader: string[] = found.header;
    if (isSubHeaderRow(rows[dataStart])) {
      effectiveHeader = mergeHeader(found.header, rows[dataStart]);
      dataStart += 1;
    }

    const columnMap = buildColumnMap(effectiveHeader);
    if (columnMap.judul == null && columnMap.kode_buku == null) continue;

    const parsed: ImporRow[] = [];
    let errors = 0;
    for (let i = dataStart; i < rows.length; i++) {
      const r = rows[i] || [];
      // Baris kosong / rekap
      const nonEmpty = r.filter((c) => c != null && String(c).trim() !== "").length;
      if (nonEmpty < 2) continue;
      const judul = toStr(r[columnMap.judul ?? -1]);
      const kode = toStr(r[columnMap.kode_buku ?? -1]);
      if (!judul) continue;

      const jml = toInt(r[columnMap.jumlah_eksemplar ?? -1]);
      const row: ImporRow = {
        _sheet: name,
        _row: i + 1,
        kode_buku: kode ?? `${name.slice(0, 6).replace(/\s+/g, "")}-${i + 1}`,
        barcode_value: toStr(r[columnMap.barcode_value ?? -1]),
        judul,
        pengarang: toStr(r[columnMap.pengarang ?? -1]),
        penerbit: toStr(r[columnMap.penerbit ?? -1]),
        tahun_terbit: toInt(r[columnMap.tahun_terbit ?? -1]),
        isbn: toStr(r[columnMap.isbn ?? -1]),
        kategori: toStr(r[columnMap.kategori ?? -1]),
        lokasi_rak: toStr(r[columnMap.lokasi_rak ?? -1]),
        deskripsi: toStr(r[columnMap.deskripsi ?? -1]),
        // Batasi ke rentang wajar; kolom yang salah tak akan meledakkan eksemplar.
        jumlah_eksemplar: jml != null && jml >= 0 && jml <= 200 ? jml : 1,
      };
      // Tangkap SEMUA kolom tak-terpetakan → meta (tanpa mengurangi informasi),
      // termasuk kolom yang tidak punya judul header tapi tetap berisi teks.
      const usedIdx = new Set(Object.values(columnMap));
      const meta: Record<string, string> = {};
      const maxCols = Math.max(effectiveHeader.length, r.length);
      for (let j = 0; j < maxCols; j++) {
        if (usedIdx.has(j)) continue;
        const val = toStr(r[j]);
        if (val == null) continue;
        const key = metaKey(effectiveHeader[j] ?? "") ?? `kolom_${j + 1}`;
        if (!(key in meta)) meta[key] = val;
      }
      if (Object.keys(meta).length) row.meta = meta;

      if (!row.judul || !row.kode_buku) {
        row._error = "judul/kode kosong";
        errors++;
      }
      parsed.push(row);
    }

    sheets.push({
      sheetName: name,
      totalBaris: rows.length,
      headerIdx: found.headerIdx,
      header: effectiveHeader,
      columnMap,
      rows: parsed,
      errorCount: errors,
    });
  }
  return { sheets };
}

export function eksporBukuKeExcel(rows: unknown[], filename = "buku.xlsx") {
  const data = (rows as Record<string, unknown>[]).map((b) => ({
    kode_buku: b.kode_buku,
    judul: b.judul,
    pengarang: b.pengarang ?? "",
    penerbit: b.penerbit ?? "",
    tahun_terbit: b.tahun_terbit ?? "",
    isbn: b.isbn ?? "",
    kategori: b.kategori ?? "",
    lokasi_rak: b.lokasi_rak ?? "",
    deskripsi: b.deskripsi ?? "",
    jumlah_eksemplar: Array.isArray(b.eksemplar)
      ? b.eksemplar.length
      : typeof b.jumlah_eksemplar === "number"
        ? b.jumlah_eksemplar
        : 0,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buku");
  XLSX.writeFile(wb, filename);
}
