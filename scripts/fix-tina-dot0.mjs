// Bersihkan FISIP_Lengkap_Tina.xlsx:
//   1. Hapus trailing ".0" dari kode barcot (sharedStrings.xml)
//   2. Hapus kolom "Catatan" (kolom U / index 20)
//
// Gambar & drawing tetap utuh — modifikasi dilakukan di level zip XML.
// Jalankan: node scripts/fix-tina-dot0.mjs
import JSZip from "jszip";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.argv[2] || "C:/Users/nabil/Downloads/FISIP_Lengkap_Tina.xlsx";
const zip = await JSZip.loadAsync(readFileSync(FILE));

// ─── 1. Strip ".0" dari sharedStrings ──────────────────────────────
const ssFile = zip.file("xl/sharedStrings.xml");
if (ssFile) {
  let xml = await ssFile.async("string");
  let dotCount = 0;
  xml = xml.replace(/<t>(\d+)\.0<\/t>/g, (_m, d) => { dotCount++; return `<t>${d}</t>`; });
  zip.file("xl/sharedStrings.xml", xml);
  console.log(`[.0] Diperbaiki: ${dotCount} string`);
}

// ─── 2. Hapus kolom U (index 20 = "Catatan") dari sheet XML ───────
// Kolom Excel: A=1, B=2, … U=21. Sel kolom U punya ref "U1", "U2", dst.
// Kolom setelah U (V, W, …) harus di-shift mundur satu huruf.
const sheetFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
for (const sf of sheetFiles) {
  let sheetXml = await zip.file(sf).async("string");

  // Hapus semua <c r="U…"> … </c> dan <c r="U…" … />
  sheetXml = sheetXml.replace(/<c\s+r="U\d+"[^>]*\/>/g, "");
  sheetXml = sheetXml.replace(/<c\s+r="U\d+"[^>]*>[\s\S]*?<\/c>/g, "");

  // Shift kolom setelah U (V→U, W→V): hanya V dan W yang ada di sheet ini (22-23 kolom)
  const shiftMap = { V: "U", W: "V", X: "W", Y: "X", Z: "Y" };
  for (const [from, to] of Object.entries(shiftMap)) {
    sheetXml = sheetXml.replace(new RegExp(`r="${from}(\\d+)"`, "g"), `r="${to}$1"`);
  }

  // Juga update <col> span jika ada dimensi
  // <dimension ref="A1:W1584"/> → kurangi 1 kolom
  sheetXml = sheetXml.replace(/<dimension\s+ref="([A-Z]+\d+):W(\d+)"/, '<dimension ref="$1:V$2"');

  zip.file(sf, sheetXml);
  console.log(`[catatan] Kolom U dihapus dari ${sf}`);
}

// ─── Simpan ────────────────────────────────────────────────────────
const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
writeFileSync(FILE, buf);
console.log("File tersimpan:", FILE);
