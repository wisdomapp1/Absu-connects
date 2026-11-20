import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// 1. Create official crisp SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" />
      <stop offset="50%" stop-color="#7c3aed" />
      <stop offset="100%" stop-color="#5b21b6" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.3" />
    </filter>
  </defs>
  <!-- Background with smooth rounded corners -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <!-- Central Connectivity Monogram 'A' -->
  <g filter="url(#shadow)">
    <!-- Main A Arch Legs -->
    <path d="M120 400 L242 108 C250 88 262 88 270 108 L392 400"
          fill="none"
          stroke="#ffffff"
          stroke-width="44"
          stroke-linecap="round"
          stroke-linejoin="round" />
    <!-- Horizontal Crossbar -->
    <path d="M172 290 L340 290"
          fill="none"
          stroke="#ffffff"
          stroke-width="38"
          stroke-linecap="round" />
    <!-- Central Connectivity Node -->
    <circle cx="256" cy="290" r="32" fill="#7c3aed" stroke="#ffffff" stroke-width="12" />
  </g>
</svg>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svgContent, 'utf-8');
console.log('Created public/icon.svg');

// Helper to write CRC32
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(len, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePNG(width, height, isMaskable = false) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace 0
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines (raw pixel data: 1 filter byte + 4 bytes per pixel)
  const bytesPerPixel = 4;
  const scanlineLength = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(height * scanlineLength);

  const cx = width / 2;
  const cy = height / 2;
  const cornerRadius = isMaskable ? 0 : width * 0.22;

  // Render violet background & white icon geometry
  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;

      // Check if inside rounded box (or full bleed for maskable)
      let inside = true;
      if (!isMaskable) {
        const dx = Math.abs(x - cx) - (cx - cornerRadius);
        const dy = Math.abs(y - cy) - (cy - cornerRadius);
        if (dx > 0 && dy > 0) {
          inside = Math.sqrt(dx * dx + dy * dy) <= cornerRadius;
        }
      }

      if (!inside) {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Gradient background: from #8b5cf6 (139, 92, 246) to #5b21b6 (91, 33, 182)
      const gradRatio = (x + y) / (width + height);
      let r = Math.round(139 * (1 - gradRatio) + 91 * gradRatio);
      let g = Math.round(92 * (1 - gradRatio) + 33 * gradRatio);
      let b = Math.round(246 * (1 - gradRatio) + 182 * gradRatio);
      let a = 255;

      // Geometry of letter 'A'
      // Scale coordinates to 0..1 range
      const scale = isMaskable ? 0.65 : 0.8;
      const nx = ((x - cx) / (width * 0.5 * scale)) + 0.5;
      const ny = ((y - cy) / (height * 0.5 * scale)) + 0.5;

      // Check if pixel belongs to 'A' stroke
      let isA = false;
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        // Left leg: line from (0.22, 0.8) to (0.5, 0.2)
        // Right leg: line from (0.5, 0.2) to (0.78, 0.8)
        // Crossbar: y around 0.58, between 0.35 and 0.65
        const strokeW = 0.085;

        // Distance to left leg
        const leftT = Math.max(0, Math.min(1, ((nx - 0.22) * 0.28 + (ny - 0.8) * -0.6) / (0.28 * 0.28 + 0.6 * 0.6)));
        const lpx = 0.22 + leftT * 0.28;
        const lpy = 0.8 - leftT * 0.6;
        const distLeft = Math.hypot(nx - lpx, ny - lpy);

        // Distance to right leg
        const rightT = Math.max(0, Math.min(1, ((nx - 0.5) * 0.28 + (ny - 0.2) * 0.6) / (0.28 * 0.28 + 0.6 * 0.6)));
        const rpx = 0.5 + rightT * 0.28;
        const rpy = 0.2 + rightT * 0.6;
        const distRight = Math.hypot(nx - rpx, ny - rpy);

        // Distance to crossbar
        const crossT = Math.max(0, Math.min(1, (nx - 0.32) / 0.36));
        const cpx = 0.32 + crossT * 0.36;
        const cpy = 0.58;
        const distCross = Math.hypot(nx - cpx, ny - cpy);

        // Center dot
        const distDot = Math.hypot(nx - 0.5, ny - 0.58);

        if (distLeft < strokeW || distRight < strokeW || distCross < strokeW * 0.8) {
          isA = true;
        }

        // Central node ring / fill
        if (distDot < 0.07) {
          if (distDot < 0.04) {
            // Inner purple node
            r = 124; g = 58; b = 237;
            isA = false;
          } else {
            // White ring
            isA = true;
          }
        }
      }

      if (isA) {
        r = 255;
        g = 255;
        b = 255;
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // Deflate IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate all standard PWA PNG assets
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-192x192.png'), generatePNG(192, 192, false));
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-512x512.png'), generatePNG(512, 512, false));
fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-maskable-512x512.png'), generatePNG(512, 512, true));
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), generatePNG(180, 180, false));
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), generatePNG(32, 32, false));

console.log('Generated crisp PWA PNG assets in public/');
