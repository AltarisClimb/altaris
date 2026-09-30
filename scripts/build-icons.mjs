// node scripts/build-icons.mjs — icônes « any » à fond transparent (le logo seul).
// Le système les affiche sur son écran de lancement (fond = background_color du
// manifeste) : le logo y « flotte » comme dans l'écran d'ouverture de l'appli.
// Les icônes « maskable » (icon-512.png, fond sombre) restent celles de l'écran d'accueil.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { MARK_D, MARK_H } from "../src/ui/brand.js";

const COLOR = [0x22, 0xd3, 0xee];
// Le tracé du monogramme n'est fait que de segments : une liste de polygones.
const polys = MARK_D.split("Z").map(p => p.trim()).filter(Boolean)
  .map(p => p.replace(/^M/, "").trim().split(/\s+/).map(xy => xy.split(",").map(Number)));

function render(size, ratio){
  const w = size * ratio, s = w / 100, h = MARK_H * s;
  const ox = (size - w) / 2, oy = (size - h) / 2 - size * 0.02;
  const pts = polys.map(poly => poly.map(([x, y]) => [ox + x * s, oy + y * s]));
  const SS = 4, alpha = new Float32Array(size * size);
  for (let py = 0; py < size; py++){
    for (let sy = 0; sy < SS; sy++){
      const y = py + (sy + 0.5) / SS, xs = [];
      for (const poly of pts) for (let i = 0; i < poly.length; i++){
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2){            // règle pair-impair
        for (let px = Math.max(0, Math.floor(xs[k])); px < Math.min(size, Math.ceil(xs[k + 1])); px++){
          for (let sx = 0; sx < SS; sx++){
            const x = px + (sx + 0.5) / SS;
            if (x >= xs[k] && x < xs[k + 1]) alpha[py * size + px] += 1 / (SS * SS);
          }
        }
      }
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++){
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++){
      const o = y * (size * 4 + 1) + 1 + x * 4, a = Math.min(1, alpha[y * size + x]);
      raw[o] = COLOR[0]; raw[o + 1] = COLOR[1]; raw[o + 2] = COLOR[2]; raw[o + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, raw);
}

function crc32(buf){
  let c, crc = 0xffffffff;
  for (const b of buf){ c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(new URL("../icon-any-512.png", import.meta.url), render(512, 0.6));
writeFileSync(new URL("../icon-any-192.png", import.meta.url), render(192, 0.6));
console.log("icon-any-512.png, icon-any-192.png");
