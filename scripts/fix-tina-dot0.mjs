// Bersihkan FISIP_Lengkap_Tina.xlsx:
//   1. Strip trailing ".0" dari sharedStrings
//   2. Kosongkan kolom "Jumlah Eksemplar" (kolom S) — header + isi.
//
// Kolom TIDAK di-shift agar tidak mengganggu drawing/foto yang sudah anchor
// ke kolom asal. Hasil: kolom S jadi kosong di Excel, tapi struktur file utuh.
// Jalankan: node scripts/fix-tina-dot0.mjs
import JSZip from "jszip";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.argv[2] || "C:/Users/nabil/Downloads/FISIP_Lengkap_Tina.xlsx";
const zip = await JSZip.loadAsync(readFileSync(FILE));

// ─── 1. Strip ".0" dari sharedStrings & hapus label "Jumlah Eksemplar" ─
const ssFile = zip.file("xl/sharedStrings.xml");
if (ssFile) {
  let xml = await ssFile.async("string");
  let dotCount = 0;
  xml = xml.replace(/<t>(\d+)\.0<\/t>/g, (_m, d) => { dotCount++; return `<t>${d}</t>`; });
  // Kosongkan entry "Jumlah Eksemplar" agar sel yang mereferensikannya jadi blank
  let labelHit = 0;
  xml = xml.replace(/<si><t[^>]*>Jumlah\s+Eksemplar<\/t><\/si>/gi, () => { labelHit++; return "<si><t></t></si>"; });
  zip.file("xl/sharedStrings.xml", xml);
  console.log(`[.0] Diperbaiki: ${dotCount} string; label "Jumlah Eksemplar" dikosongkan: ${labelHit}`);
}

// ─── 2. Kosongkan semua sel di kolom S ────────────────────────────
const sheetFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
for (const sf of sheetFiles) {
  let sheetXml = await zip.file(sf).async("string");
  let removed = 0;
  // Hapus semua <c r="S…"> … </c> dan <c r="S…" … />
  sheetXml = sheetXml.replace(/<c\s+r="S\d+"[^>]*\/>/g, () => { removed++; return ""; });
  sheetXml = sheetXml.replace(/<c\s+r="S\d+"[^>]*>[\s\S]*?<\/c>/g, () => { removed++; return ""; });
  zip.file(sf, sheetXml);
  console.log(`[jumlah_eks] ${removed} sel di kolom S dihapus dari ${sf}`);
}

// ─── Simpan ────────────────────────────────────────────────────────
const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
writeFileSync(FILE, buf);
console.log("File tersimpan:", FILE);
