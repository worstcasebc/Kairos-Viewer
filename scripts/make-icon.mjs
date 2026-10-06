// Erzeugt app-icon.png (1024×1024, RGBA): blaues abgerundetes Quadrat mit drei Gantt-Balken.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const BARS = [
  [200, 300, 560, 380],
  [420, 470, 820, 550],
  [300, 640, 700, 720],
];
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  const row = y * (S * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < S; x++) {
    const i = row + 1 + x * 4;
    let rgba = [0, 0, 0, 0];
    if (inRoundRect(x, y, 64, 64, 960, 960, 180)) rgba = [47, 111, 214, 255];
    if (BARS.some(([x0, y0, x1, y1]) => inRoundRect(x, y, x0, y0, x1, y1, 40))) rgba = [255, 255, 255, 255];
    raw.set(rgba, i);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('app-icon.png', png);
console.log('app-icon.png geschrieben');
