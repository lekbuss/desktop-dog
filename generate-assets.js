// Generates assets/dog.png (96x96) and assets/tray-icon.png (16x16)
// Pure Node.js — no native dependencies, uses only zlib + fs

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const payload = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

function createPNG(width, height, pixelFn) {
  // Build raw RGBA scanlines (filter byte 0 = None per row)
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const off = 1 + x * 4;
      row[off] = r; row[off + 1] = g; row[off + 2] = b; row[off + 3] = a;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA color type
  // bytes 10,11,12 = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function dist2(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

// Check if point (px,py) is within r pixels of line segment (ax,ay)-(bx,by)
function nearSegment(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(px, py, ax, ay) <= r * r;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist2(px, py, ax + t * dx, ay + t * dy) <= r * r;
}

// Ellipse check
function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

// Dog sprite pixel function (96x96)
function dogPixel(x, y) {
  const T = [0, 0, 0, 0];
  const brown = [139, 69, 19, 255];
  const lb = [185, 122, 87, 255];   // lighter body
  const dark = [30, 20, 10, 255];
  const pink = [220, 90, 90, 255];
  const white = [255, 250, 240, 255];

  // Left ear (behind head)
  if (inEllipse(x, y, 28, 14, 12, 16)) return brown;
  // Right ear
  if (inEllipse(x, y, 68, 14, 12, 16)) return brown;

  // Body: circle at (48,58) r=30
  if (dist2(x, y, 48, 58) <= 30 * 30) return lb;

  // Head: circle at (48,30) r=24
  if (dist2(x, y, 48, 30) <= 24 * 24) return lb;

  // Tail: thick curve from body right side
  if (nearSegment(x, y, 76, 52, 88, 38, 5)) return brown;
  if (nearSegment(x, y, 88, 38, 84, 26, 4)) return brown;

  // Front legs
  if (nearSegment(x, y, 36, 80, 34, 92, 6)) return lb;
  if (nearSegment(x, y, 60, 80, 62, 92, 6)) return lb;
  // Paw pads (dark)
  if (dist2(x, y, 34, 92) <= 5 * 5) return brown;
  if (dist2(x, y, 62, 92) <= 5 * 5) return brown;

  // Left eye white
  if (dist2(x, y, 39, 27) <= 6 * 6) return white;
  // Right eye white
  if (dist2(x, y, 57, 27) <= 6 * 6) return white;
  // Left pupil
  if (dist2(x, y, 40, 28) <= 3 * 3) return dark;
  // Right pupil
  if (dist2(x, y, 58, 28) <= 3 * 3) return dark;
  // Eye shine
  if (dist2(x, y, 38, 26) <= 1.2 * 1.2) return white;
  if (dist2(x, y, 56, 26) <= 1.2 * 1.2) return white;

  // Nose
  if (inEllipse(x, y, 48, 36, 5, 4)) return dark;
  // Nose highlight
  if (dist2(x, y, 46, 35) <= 1.5 * 1.5) return [100, 80, 80, 255];

  // Mouth
  if (nearSegment(x, y, 48, 40, 42, 44, 1.5)) return dark;
  if (nearSegment(x, y, 48, 40, 54, 44, 1.5)) return dark;

  // Inner ear color
  if (inEllipse(x, y, 28, 14, 7, 10)) return pink;
  if (inEllipse(x, y, 68, 14, 7, 10)) return pink;

  return T;
}

// Tray icon pixel function (16x16)
function trayPixel(x, y) {
  const T = [0, 0, 0, 0];
  const brown = [139, 69, 19, 255];
  const lb = [185, 122, 87, 255];
  const dark = [30, 20, 10, 255];

  if (inEllipse(x, y, 4, 3, 2.5, 3)) return brown;   // left ear
  if (inEllipse(x, y, 12, 3, 2.5, 3)) return brown;  // right ear
  if (dist2(x, y, 8, 10) <= 5 * 5) return lb;         // body
  if (dist2(x, y, 8, 5) <= 4 * 4) return lb;          // head
  if (dist2(x, y, 6, 5) <= 1 * 1) return dark;        // left eye
  if (dist2(x, y, 10, 5) <= 1 * 1) return dark;       // right eye
  if (dist2(x, y, 8, 7) <= 1 * 1) return dark;        // nose
  return T;
}

// 256x256 app icon — 柴犬正脸，居中构图
function iconPixel(x, y) {
  const S = 256;
  const cx = S / 2, cy = S / 2;
  const T = [0, 0, 0, 0];
  const brown     = [139, 69,  19,  255];
  const lb        = [212, 160, 100, 255];
  const face      = [228, 180, 120, 255];
  const cream     = [245, 225, 185, 255];
  const dark      = [30,  18,  8,   255];
  const white     = [255, 252, 245, 255];
  const pink      = [220, 100, 90,  255];
  const noseDark  = [110, 55,  30,  255];

  // 圆形边界裁剪（超出整体圆形区域透明）
  if (dist2(x, y, cx, cy) > 122 * 122) return T;

  // 背景底色（暖橙）
  const bg = [210, 140, 70, 255];

  // ── 耳朵（在头部后面） ──
  // 左耳外形
  if (inEllipse(x, y, 72,  72, 38, 52)) return brown;
  // 右耳外形
  if (inEllipse(x, y, 184, 72, 38, 52)) return brown;
  // 左耳内
  if (inEllipse(x, y, 72,  74, 24, 34)) return pink;
  // 右耳内
  if (inEllipse(x, y, 184, 74, 24, 34)) return pink;

  // ── 头部 ──
  if (dist2(x, y, cx, cy - 4) <= 100 * 100) {
    // 脸部渐变：中心偏亮
    const fd = Math.sqrt(dist2(x, y, cx, cy - 4));
    if (fd < 60) return face;
    return lb;
  }

  // ── 脸部细节（只在头部内部） ──
  // 以下判断依赖头部圆已 return，不会到这里，改为不做处理
  return bg;
}

// 256x256 app icon（分层绘制，确保正确覆盖顺序）
function iconPixelLayered(x, y) {
  const S = 256;
  const cx = S / 2, cy = S / 2 - 4;
  const T = [0, 0, 0, 0];

  const brown    = [139, 69,  19,  255];
  const lb       = [212, 155, 95,  255];
  const face     = [230, 178, 115, 255];
  const cream    = [248, 228, 188, 255];
  const dark     = [28,  16,  6,   255];
  const white_   = [255, 252, 244, 255];
  const pink     = [215, 95,  85,  255];
  const noseDark = [105, 50,  25,  255];

  // 整体裁成圆形
  if (dist2(x, y, S/2, S/2) > 120 * 120) return T;

  // 背景（暖橙圆）
  let pixel = [210, 138, 68, 255];

  // 耳朵外（棕）
  if (inEllipse(x, y, 70,  68, 40, 54)) pixel = brown;
  if (inEllipse(x, y, 186, 68, 40, 54)) pixel = brown;
  // 耳朵内（粉）
  if (inEllipse(x, y, 70,  70, 25, 35)) pixel = pink;
  if (inEllipse(x, y, 186, 70, 25, 35)) pixel = pink;

  // 头部（大圆）
  if (dist2(x, y, cx, cy) <= 98 * 98) pixel = lb;

  // 脸部中央（亮区）
  if (dist2(x, y, cx, cy) <= 70 * 70) pixel = face;

  // 脸颊奶油色斑块
  if (inEllipse(x, y, cx - 32, cy + 22, 22, 16)) pixel = cream;
  if (inEllipse(x, y, cx + 32, cy + 22, 22, 16)) pixel = cream;

  // 眼睛（白底）
  if (dist2(x, y, cx - 30, cy - 18) <= 18 * 18) pixel = white_;
  if (dist2(x, y, cx + 30, cy - 18) <= 18 * 18) pixel = white_;
  // 眼睛（瞳孔）
  if (dist2(x, y, cx - 28, cy - 16) <= 11 * 11) pixel = dark;
  if (dist2(x, y, cx + 28, cy - 16) <= 11 * 11) pixel = dark;
  // 眼睛（高光）
  if (dist2(x, y, cx - 34, cy - 22) <= 4 * 4) pixel = white_;
  if (dist2(x, y, cx + 22, cy - 22) <= 4 * 4) pixel = white_;

  // 鼻子
  if (inEllipse(x, y, cx, cy + 14, 20, 14)) pixel = noseDark;
  if (inEllipse(x, y, cx, cy + 10, 12,  8)) pixel = [80, 40, 20, 255];
  // 鼻梁高光
  if (inEllipse(x, y, cx - 5, cy + 10, 5, 4)) pixel = [140, 80, 50, 255];

  // 嘴巴（左弧）
  if (nearSegment(x, y, cx,      cy + 28, cx - 20, cy + 42, 3.5)) pixel = dark;
  // 嘴巴（右弧）
  if (nearSegment(x, y, cx,      cy + 28, cx + 20, cy + 42, 3.5)) pixel = dark;

  // 下巴奶油
  if (inEllipse(x, y, cx, cy + 52, 34, 22)) pixel = cream;

  return pixel;
}

// ICO 容器：将一张 PNG buffer 包装成合法 ICO
// width/height = 0 在 ICO 格式中表示 256
function createICO(pngBuf) {
  // ICONDIR: 6 bytes
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);   // reserved = 0
  dir.writeUInt16LE(1, 2);   // type = 1 (ICO)
  dir.writeUInt16LE(1, 4);   // image count = 1

  // ICONDIRENTRY: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width:  0 => 256
  entry[1] = 0;   // height: 0 => 256
  entry[2] = 0;   // colorCount (0 = truecolor)
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1,  4);              // planes
  entry.writeUInt16LE(32, 6);              // bitCount (32-bit RGBA)
  entry.writeUInt32LE(pngBuf.length, 8);   // bytesInRes
  entry.writeUInt32LE(22, 12);             // imageOffset = 6 + 16

  return Buffer.concat([dir, entry, pngBuf]);
}

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const dogPng  = createPNG(96,  96,  dogPixel);
const trayPng = createPNG(16,  16,  trayPixel);
const iconPng = createPNG(256, 256, iconPixelLayered);

fs.writeFileSync(path.join(assetsDir, 'dog.png'),        dogPng);
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'),  trayPng);
fs.writeFileSync(path.join(assetsDir, 'app-icon.ico'),   createICO(iconPng));

console.log('Assets generated:');
console.log('  dog.png        96x96');
console.log('  tray-icon.png  16x16');
console.log('  app-icon.ico   256x256 (PNG-in-ICO)');
