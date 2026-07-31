import JSZip from "jszip";

// Mem-parse gambar tertanam dari sheet "FISIP Lengkap (Tina)" pada berkas
// .xlsx dan memetakan gambar ke baris (row index 0-based sesuai sheet Excel;
// data pertama berada di baris ke-3 karena baris 0-1 judul, baris 2 header).
//
// Cara kerja:
//   xl/workbook.xml            → cari r:id sheet Tina
//   xl/_rels/workbook.xml.rels → r:id → xl/worksheets/sheetN.xml
//   xl/worksheets/_rels/sheetN.xml.rels → drawing target
//   xl/drawings/drawingM.xml   → <xdr:anchor><xdr:from><xdr:row/></> + rIdBlip
//   xl/drawings/_rels/drawingM.xml.rels → rIdBlip → media/imageK.ext
export type ImageAtRow = { rowIndex: number; blob: Blob; ext: string };

const NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

function absPath(base: string, target: string): string {
  // base: "xl/drawings/drawingM.xml", target: "../media/imageK.png" → "xl/media/imageK.png"
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export async function parseImagesTina(file: File): Promise<ImageAtRow[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !wbRels) return [];

  const sheetMatch = wbXml.match(
    /<sheet[^>]*name="FISIP Lengkap \(Tina\)"[^>]*r:id="(rId\d+)"[^/]*\/>/i,
  );
  if (!sheetMatch) return [];
  const rId = sheetMatch[1];
  const relRe = new RegExp(`<Relationship\\s+Id="${rId}"[^>]+Target="([^"]+)"`);
  const targetMatch = wbRels.match(relRe);
  if (!targetMatch) return [];
  const sheetTargetRel = targetMatch[1]; // "worksheets/sheetN.xml"
  const sheetPath = sheetTargetRel.startsWith("xl/") ? sheetTargetRel : `xl/${sheetTargetRel}`;
  const sheetBase = sheetPath.split("/").pop()!.replace(/\.xml$/, "");
  const sheetRelsPath = `xl/worksheets/_rels/${sheetBase}.xml.rels`;
  const sheetRelsFile = zip.file(sheetRelsPath);
  if (!sheetRelsFile) return [];
  const sheetRelsXml = await sheetRelsFile.async("string");
  const drawMatch = sheetRelsXml.match(/Target="([^"]*drawings\/drawing\d+\.xml)"/);
  if (!drawMatch) return [];
  const drawingPath = absPath(sheetRelsPath, drawMatch[1]);

  const drawingXml = await zip.file(drawingPath)?.async("string");
  const drawingRelsPath = drawingPath.replace(/([^/]+)\.xml$/, "_rels/$1.xml.rels");
  const drawingRelsXml = await zip.file(drawingRelsPath)?.async("string");
  if (!drawingXml || !drawingRelsXml) return [];

  // rId → media path
  const rIdToMedia = new Map<string, string>();
  for (const m of drawingRelsXml.matchAll(/<Relationship\s+Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
    rIdToMedia.set(m[1], absPath(drawingPath, m[2]));
  }

  // Parse anchors: baik oneCellAnchor maupun twoCellAnchor mengandung
  // <xdr:from><xdr:row>N</xdr:row></xdr:from> dan <a:blip r:embed="rIdX"/>.
  const parser = new DOMParser();
  const dom = parser.parseFromString(drawingXml, "application/xml");
  const anchors = [
    ...Array.from(dom.getElementsByTagNameNS(NS, "twoCellAnchor")),
    ...Array.from(dom.getElementsByTagNameNS(NS, "oneCellAnchor")),
    ...Array.from(dom.getElementsByTagNameNS(NS, "absoluteAnchor")),
  ];

  const out: ImageAtRow[] = [];
  for (const anchor of anchors) {
    const fromRow =
      anchor.getElementsByTagNameNS(NS, "from")[0]?.getElementsByTagNameNS(NS, "row")[0]
        ?.textContent;
    const blip = anchor.getElementsByTagName("a:blip")[0];
    const embed =
      blip?.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "embed",
      ) ?? blip?.getAttribute("r:embed");
    if (fromRow == null || !embed) continue;
    const mediaPath = rIdToMedia.get(embed);
    if (!mediaPath) continue;
    const bin = await zip.file(mediaPath)?.async("uint8array");
    if (!bin) continue;
    const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "gif"
            ? "image/gif"
            : "application/octet-stream";
    // Copy the underlying buffer slice into a fresh, standalone ArrayBuffer
    // agar Blob tak menyimpan referensi ke SharedArrayBuffer-like.
    const copy = new Uint8Array(bin.length);
    copy.set(bin);
    out.push({
      rowIndex: Number(fromRow),
      blob: new Blob([copy.buffer as ArrayBuffer], { type: mime }),
      ext,
    });
  }
  return out;
}
