import * as XLSX from "xlsx";

export type ImporRow = {
  kode_buku: string;
  judul: string;
  pengarang?: string | null;
  penerbit?: string | null;
  tahun_terbit?: number | null;
  isbn?: string | null;
  kategori?: string | null;
  lokasi_rak?: string | null;
  deskripsi?: string | null;
  jumlah_eksemplar?: number | null;
  _sheet?: string;
  _row?: number;
  _error?: string;
};

const norm = (s: any) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Sinonim header → field DB
const MAP: Record<string, string[]> = {
  kode_buku: ["kodebuku", "kodeitem", "noinventaris", "noinv", "inv", "id", "kode"],
  judul: ["judul", "title"],
  pengarang: ["pengarang", "author", "penulis"],
  penerbit: ["penerbit", "namapenerbit", "publisher", "puhdisher"],
  tahun_terbit: ["tahunterbit", "tahun", "year"],
  isbn: ["isbn", "isbnissn"],
  kategori: ["jeniskoleksi", "jenis", "kategori", "subjek", "klasifikasi", "klass"],
  lokasi_rak: ["nopanggil", "lokasi", "kodelokasi", "rak"],
  deskripsi: ["deskripsi", "deskripsifisik", "keterangan"],
  jumlah_eksemplar: ["jumlaheksemplar", "jumlahbuku", "eksemplar", "eks", "jumlah", "jml", "satuan"],
};

// Semua kata kunci untuk mendeteksi baris header
const ALL_HEADER_TOKENS = new Set(Object.values(MAP).flat());

function findHeaderRow(rows: any[][]): { headerIdx: number; header: string[] } | null {
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
function isSubHeaderRow(row: any[]): boolean {
  if (!row) return false;
  const cells = row.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (cells.length === 0) return false;
  const looksHeader = cells.every((c) => c.length <= 25 && /[a-zA-Z]/.test(c) && !/\d{3,}/.test(c));
  return looksHeader && cells.length <= 8;
}

function buildColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, idx) => {
    const n = norm(h);
    if (!n) return;
    for (const [field, keys] of Object.entries(MAP)) {
      if (map[field] !== undefined) continue;
      if (keys.includes(n) || keys.some((k) => n === k || n.startsWith(k) || n.endsWith(k))) {
        map[field] = idx;
      }
    }
  });
  return map;
}

function toStr(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}
function toInt(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d\-]/g, ""));
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
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as any[][];
    if (!rows.length) continue;
    const found = findHeaderRow(rows);
    if (!found) continue;
    let dataStart = found.headerIdx + 1;
    if (isSubHeaderRow(rows[dataStart])) dataStart += 1;
    const columnMap = buildColumnMap(found.header);
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

      const row: ImporRow = {
        _sheet: name,
        _row: i + 1,
        kode_buku: kode ?? `${name.slice(0, 6).replace(/\s+/g, "")}-${i + 1}`,
        judul,
        pengarang: toStr(r[columnMap.pengarang ?? -1]),
        penerbit: toStr(r[columnMap.penerbit ?? -1]),
        tahun_terbit: toInt(r[columnMap.tahun_terbit ?? -1]),
        isbn: toStr(r[columnMap.isbn ?? -1]),
        kategori: toStr(r[columnMap.kategori ?? -1]),
        lokasi_rak: toStr(r[columnMap.lokasi_rak ?? -1]),
        deskripsi: toStr(r[columnMap.deskripsi ?? -1]),
        jumlah_eksemplar: toInt(r[columnMap.jumlah_eksemplar ?? -1]) ?? 1,
      };
      if (!row.judul || !row.kode_buku) { row._error = "judul/kode kosong"; errors++; }
      parsed.push(row);
    }

    sheets.push({
      sheetName: name,
      totalBaris: rows.length,
      headerIdx: found.headerIdx,
      header: found.header,
      columnMap,
      rows: parsed,
      errorCount: errors,
    });
  }
  return { sheets };
}

export function eksporBukuKeExcel(rows: any[], filename = "buku.xlsx") {
  const data = rows.map((b) => ({
    kode_buku: b.kode_buku,
    judul: b.judul,
    pengarang: b.pengarang ?? "",
    penerbit: b.penerbit ?? "",
    tahun_terbit: b.tahun_terbit ?? "",
    isbn: b.isbn ?? "",
    kategori: b.kategori ?? "",
    lokasi_rak: b.lokasi_rak ?? "",
    deskripsi: b.deskripsi ?? "",
    jumlah_eksemplar: b.eksemplar?.length ?? 0,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buku");
  XLSX.writeFile(wb, filename);
}
