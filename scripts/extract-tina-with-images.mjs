// Ekstrak sheet "FISIP Lengkap (Tina)" jadi 1 file .xlsx yang TETAP
// membawa gambar tertanam aslinya. Zip-surgery: unzip file sumber, salin
// hanya bagian yang dibutuhkan (sheet9, drawing3, seluruh xl/media,
// sharedStrings, styles, theme), lalu perbaiki workbook.xml + rels +
// Content_Types agar merujuk sheet9 sebagai satu-satunya sheet.
//
// Jalankan: node scripts/extract-tina-with-images.mjs

import JSZip from "jszip";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SRC = "C:/Users/nabil/Downloads/INVENTARIS_BUKU_tersusun.xlsx";
const OUT = "C:/Users/nabil/Downloads/FISIP_Lengkap_Tina.xlsx";

if (!existsSync(SRC)) {
  console.error("File sumber tidak ditemukan:", SRC);
  process.exit(1);
}

const src = await JSZip.loadAsync(readFileSync(SRC));
const out = new JSZip();

// Baca peta rId → target dari workbook.xml.rels sumber
const wbRelsXml = await src.file("xl/_rels/workbook.xml.rels").async("string");
// Baca workbook.xml sumber untuk menemukan sheet Tina
const wbXml = await src.file("xl/workbook.xml").async("string");

const sheetMatch = wbXml.match(
  /<sheet[^>]+name="FISIP Lengkap \(Tina\)"[^>]+r:id="(rId\d+)"[^\/]*\/>/,
);
if (!sheetMatch) throw new Error("Sheet 'FISIP Lengkap (Tina)' tak ditemukan di workbook.xml");
const rIdTina = sheetMatch[1];

const relRe = new RegExp(
  `<Relationship\\s+Id="${rIdTina}"[^>]+Target="([^"]+)"`,
);
const targetMatch = wbRelsXml.match(relRe);
if (!targetMatch) throw new Error(`Target untuk ${rIdTina} tak ditemukan`);
const sheetTarget = targetMatch[1]; // mis. "worksheets/sheet9.xml"
console.log("Sheet Tina:", rIdTina, "→", sheetTarget);

// Baca sheetN.xml.rels bila ada (mencari drawing)
const sheetBase = sheetTarget.replace(/^worksheets\//, "").replace(/\.xml$/, "");
const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.xml.rels`;
const sheetRelsFile = src.file(sheetRelsPath);
let drawingSrcPath = null;
if (sheetRelsFile) {
  const relXml = await sheetRelsFile.async("string");
  const drawMatch = relXml.match(/Target="([^"]*drawings\/drawing\d+\.xml)"/);
  if (drawMatch) drawingSrcPath = drawMatch[1].replace(/^\.\.\//, "xl/");
}
console.log("Drawing:", drawingSrcPath ?? "(tak ada gambar)");

// -------- Bangun output ------------
// [Content_Types].xml minimal: workbook + sheet1 + drawing1 + rels + media
async function copyBinary(from, to) {
  const f = src.file(from);
  if (!f) throw new Error(`Missing in source: ${from}`);
  const data = await f.async("uint8array");
  out.file(to, data);
}
async function copyText(from, to) {
  const f = src.file(from);
  if (!f) throw new Error(`Missing in source: ${from}`);
  out.file(to, await f.async("string"));
}

// 1. worksheet Tina → xl/worksheets/sheet1.xml
await copyText(sheetTarget.startsWith("xl/") ? sheetTarget : `xl/${sheetTarget}`, "xl/worksheets/sheet1.xml");

// 2. sharedStrings, styles, theme, calcChain (opsional)
if (src.file("xl/sharedStrings.xml")) await copyText("xl/sharedStrings.xml", "xl/sharedStrings.xml");
if (src.file("xl/styles.xml")) await copyText("xl/styles.xml", "xl/styles.xml");
if (src.file("xl/theme/theme1.xml")) await copyText("xl/theme/theme1.xml", "xl/theme/theme1.xml");

// 3. drawing + media (bila ada)
const mediaFiles = [];
if (drawingSrcPath) {
  const drawingXml = await src.file(drawingSrcPath).async("string");
  // Perbaiki rIds & target: kita akan pindahkan ke drawing1.xml
  out.file("xl/drawings/drawing1.xml", drawingXml);

  // Salin _rels drawing (peta gambar)
  const drawingBase = drawingSrcPath.split("/").pop().replace(/\.xml$/, "");
  const drawingRelsPath = `xl/drawings/_rels/${drawingBase}.xml.rels`;
  if (src.file(drawingRelsPath)) {
    let rels = await src.file(drawingRelsPath).async("string");
    // Rels menunjuk ../media/imageN.xxx — tetap valid setelah pindah
    out.file("xl/drawings/_rels/drawing1.xml.rels", rels);
    // Cari semua gambar yang direferensikan
    const imgs = [...rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map((m) => m[1]);
    for (const img of imgs) mediaFiles.push(img);
  }

  // Salin comments VML jika ada (drawingBase digantikan ../drawings/vmlDrawingN)
  // Untuk kesederhanaan, skip comments — tak dibutuhkan katalog.
}

// Salin semua media yang direferensikan drawing Tina
const uniqueMedia = [...new Set(mediaFiles)];
for (const m of uniqueMedia) {
  const from = `xl/media/${m}`;
  if (src.file(from)) await copyBinary(from, `xl/media/${m}`);
}
console.log("Gambar disalin:", uniqueMedia.length);

// 4. workbook.xml (satu sheet saja, rId1)
out.file(
  "xl/workbook.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="FISIP Lengkap (Tina)" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
);

// 5. workbook.xml.rels
out.file(
  "xl/_rels/workbook.xml.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`,
);

// 6. sheet1.xml.rels (menunjuk drawing1)
if (drawingSrcPath) {
  out.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  );
}

// 7. _rels/.rels (root)
out.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
);

// 8. [Content_Types].xml
const extSet = new Set(uniqueMedia.map((m) => m.split(".").pop().toLowerCase()));
const extDefaults = [
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
];
for (const ext of extSet) {
  const ct =
    ext === "jpeg" || ext === "jpg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "gif"
          ? "image/gif"
          : "application/octet-stream";
  extDefaults.push(`<Default Extension="${ext}" ContentType="${ct}"/>`);
}
out.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${extDefaults.join("\n  ")}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${drawingSrcPath ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
</Types>`,
);

// Tulis
const buf = await out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
writeFileSync(OUT, buf);
console.log(`\nOK: ${OUT}\nUkuran: ${(buf.length / 1024 / 1024).toFixed(2)} MB\nGambar tertanam: ${uniqueMedia.length}`);
