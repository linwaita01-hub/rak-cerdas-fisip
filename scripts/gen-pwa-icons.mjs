// Generator ikon PWA untuk "Perpus FISIP ULM".
// Tanpa dependency (murni Node + zlib): menggambar tile maroon merek + glyph
// buku terbuka putih, lalu meng-encode PNG RGBA dari nol.
//
// Jalankan: node scripts/gen-pwa-icons.mjs
// Output ke public/: icon-192.png, icon-512.png, icon-maskable-512.png,
//                    apple-touch-icon.png
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public");

// ---- Warna merek (maroon FISIP ULM) ----
const MAROON = [122, 31, 31]; // #7a1f1f — sama dengan theme-color di __root.tsx
const PAPER = [251, 247, 240]; // warm white

// ---- Encoder PNG (color type 6 = RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // scanlines dengan filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Util geometri ----
// Titik di dalam quad konveks (urutan searah): sisi-sama-tanda.
function insideQuad(px, py, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i];
    const [bx, by] = quad[(i + 1) % 4];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const s = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// Gambar satu ikon. Koordinat glyph dinormalisasi 0..1 (aman untuk maskable
// karena berada dalam lingkaran pusat berdiameter 80%).
function drawIcon(size, { rounded }) {
  const SS = 4; // supersample untuk anti-alias
  const S = size * SS;
  const buf = Buffer.alloc(S * S * 4);

  const radius = rounded ? 0.18 * S : 0; // sudut membulat untuk ikon "any"
  const cornerCenters = [
    [radius, radius],
    [S - radius, radius],
    [radius, S - radius],
    [S - radius, S - radius],
  ];
  function inRoundedRect(x, y) {
    if (radius <= 0) return true;
    if (x >= radius && x <= S - radius) return true;
    if (y >= radius && y <= S - radius) return true;
    for (const [cx, cy] of cornerCenters) {
      if (Math.hypot(x - cx, y - cy) <= radius) {
        // hanya berlaku bila di kuadran sudut ybs
        const inX = (cx < S / 2 && x < radius) || (cx > S / 2 && x > S - radius);
        const inY = (cy < S / 2 && y < radius) || (cy > S / 2 && y > S - radius);
        if (inX && inY) return true;
      }
    }
    return false;
  }

  // Glyph buku terbuka (normalisasi 0..1)
  const spineTop = [0.5, 0.34];
  const spineBot = [0.5, 0.72];
  const leftPage = [[0.17, 0.4], spineTop, spineBot, [0.17, 0.66]];
  const rightPage = [spineTop, [0.83, 0.4], [0.83, 0.66], spineBot];
  // garis teks pada tiap halaman
  const textLines = [0.47, 0.53, 0.59];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = (y * S + x) * 4;
      if (!inRoundedRect(x + 0.5, y + 0.5)) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }
      const nx = (x + 0.5) / S;
      const ny = (y + 0.5) / S;
      let color = MAROON;

      const onLeft = insideQuad(nx, ny, leftPage);
      const onRight = insideQuad(nx, ny, rightPage);
      if (onLeft || onRight) {
        color = PAPER;
        // spine (garis maroon tipis di tengah)
        if (Math.abs(nx - 0.5) < 0.012) color = MAROON;
        // garis teks
        for (const ly of textLines) {
          if (Math.abs(ny - ly) < 0.008) {
            const inInk = onLeft ? nx > 0.22 && nx < 0.46 : nx > 0.54 && nx < 0.78;
            if (inInk) color = MAROON;
          }
        }
      }
      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = 255;
    }
  }

  // Downsample box SSxSS -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const sidx = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const alpha = buf[sidx + 3];
          r += buf[sidx] * alpha;
          g += buf[sidx + 1] * alpha;
          b += buf[sidx + 2] * alpha;
          a += alpha;
        }
      }
      const n = SS * SS;
      const oidx = (y * size + x) * 4;
      out[oidx] = a ? Math.round(r / a) : 0;
      out[oidx + 1] = a ? Math.round(g / a) : 0;
      out[oidx + 2] = a ? Math.round(b / a) : 0;
      out[oidx + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, out);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ["icon-192.png", 192, { rounded: true }],
  ["icon-512.png", 512, { rounded: true }],
  ["icon-maskable-512.png", 512, { rounded: false }],
  ["apple-touch-icon.png", 180, { rounded: false }],
];
for (const [name, size, opts] of files) {
  const png = drawIcon(size, opts);
  writeFileSync(join(OUT, name), png);
  console.log(`✓ ${name} (${size}x${size}, ${png.length} bytes)`);
}
console.log("Selesai — ikon PWA dibuat di public/");
