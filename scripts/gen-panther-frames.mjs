/**
 * PANTHER — Cinematic Frame Sequence Generator
 * ==========================================
 * Generates 60 luxury editorial PNG frames (800×1000) in pure Node.js.
 * No npm dependencies. Uses only built-in `zlib` and `fs`.
 *
 * Visual concept:
 *   - Black linen shirt silhouette on a deep cinematic dark ground
 *   - Soft volumetric rim lighting + directional shoulder highlight
 *   - Controlled 140° pseudo-3D rotation arc (front → ¾ side → partial back → return)
 *   - Linen texture grain overlay
 *   - Vignette
 *   - Annotation-safe composition: 65–75% vertical shirt height
 *
 * Output: public/sequences/linen-shirt/frame_0001.webp (PNG bytes, .webp ext)
 * Hot-swap: drop real AI/3D renders over these files — engine unchanged.
 *
 * Run: node scripts/gen-panther-frames.mjs
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'sequences', 'linen-shirt');
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 800;
const H = 1000;
const FRAMES = 60;

/* ─────────────────────────────────────────────────────────────────────
   PURE-NODE PNG ENCODER
   Writes IHDR + IDAT (deflate compressed) + IEND.
   Input: Uint8Array of RGBA pixels, row-major.
   ───────────────────────────────────────────────────────────────────── */
function encodePNG(rgba, width, height) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB (we strip alpha below for smaller files)
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines with filter byte 0 (None)
  // We write as RGBA (color type 6) for simplicity
  const ihdr2 = Buffer.alloc(13);
  ihdr2.writeUInt32BE(width, 0);
  ihdr2.writeUInt32BE(height, 4);
  ihdr2[8] = 8;   // bit depth
  ihdr2[9] = 6;   // RGBA
  ihdr2[10] = 0; ihdr2[11] = 0; ihdr2[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      scanlines[dst] = rgba[src];     // R
      scanlines[dst + 1] = rgba[src + 1]; // G
      scanlines[dst + 2] = rgba[src + 2]; // B
      scanlines[dst + 3] = rgba[src + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeB, data]);
    const crcVal = crc32(crcInput);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr2),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* CRC32 table */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ─────────────────────────────────────────────────────────────────────
   MATH HELPERS
   ───────────────────────────────────────────────────────────────────── */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ─────────────────────────────────────────────────────────────────────
   NOISE  (simple deterministic gradient noise for linen texture)
   ───────────────────────────────────────────────────────────────────── */
function hash(x, y) {
  let h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(hash(ix, iy), hash(ix + 1, iy), ux),
    lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux),
    uy
  );
}

function fbm(x, y, octaves = 4) {
  let v = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * freq, y * freq);
    max += amp; amp *= 0.5; freq *= 2.1;
  }
  return v / max;
}

/* ─────────────────────────────────────────────────────────────────────
   SHIRT GEOMETRY
   A parametric shirt shape computed per-frame via rotation angle.
   The "rotation" is simulated by:
     1. Horizontally compressing/skewing the silhouette (foreshortening)
     2. Shifting the lighting source angle
     3. Morphing collar and shoulder widths
   This creates a convincing pseudo-3D rotation illusion.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Returns signed distance to the shirt silhouette.
 * Negative = inside shirt, positive = outside.
 * `angle` is rotation in radians (0 = front, π*0.78 ≈ 140°).
 * `nx`, `ny` are normalised canvas coords [0,1].
 */
function shirtSDF(nx, ny, angle) {
  // Foreshortening: compress x-axis as we rotate to side view
  const cosA = Math.cos(angle);
  const perspective = 0.42 + 0.58 * Math.abs(cosA); // 1.0 at front, 0.42 at 90°
  const sinA = Math.sin(angle);

  // Center the shirt
  const cx = 0.5 + sinA * 0.04; // slight lateral drift with rotation
  const cy = 0.5;

  // Shirt coordinate space — rescaled for annotation-safe composition
  const sx = (nx - cx) / (0.34 * perspective); // [-1,1] range across shirt width
  const sy = (ny - 0.1) / 0.78;                // [0,1] from collar-top to shirt-bottom

  // --- Body outline ---
  // Shirt body: trapezoidal — wider at shoulders, tapers slightly to hem
  const bodyWidth = lerp(0.78, 0.9, smoothstep(0.3, 0.8, sy)); // shoulder → hem
  // Side seam curves inward slightly at waist
  const waistPinch = 1.0 - 0.06 * Math.exp(-Math.pow((sy - 0.55) / 0.12, 2));
  const bodyHalfW = 0.5 * bodyWidth * waistPinch;

  // Shirt exists vertically between collar (sy≈0) and hem (sy≈1)
  if (sy < 0 || sy > 1.0) return 999;

  // Shoulder slope: upper body curves from narrow collar to wide shoulder
  const shoulderY = 0.18; // normalised y where shoulders peak
  let effectiveHalfW;
  if (sy < shoulderY) {
    // Collar region: narrow near top, widens to shoulder
    effectiveHalfW = lerp(0.28, bodyHalfW, sy / shoulderY);
  } else {
    effectiveHalfW = bodyHalfW;
  }

  // Distance to body side edges
  const bodyDist = Math.abs(sx) - effectiveHalfW;

  // --- Collar / neck ---
  // V-collar: cut a V from the top centre
  const collarDepth = 0.22; // how deep the V goes
  const collarWidth = 0.18; // half-width of V at deepest
  let collarCut = -999;
  if (sy < collarDepth) {
    // V shape: as sy increases from 0, V widens
    const vHalfW = lerp(0.0, collarWidth, sy / collarDepth);
    collarCut = vHalfW - Math.abs(sx); // positive = inside V (to be removed)
  }

  // --- Sleeves --- (folded, visible below shoulder)
  const sleeveY0 = 0.12, sleeveY1 = 0.42;
  // Sleeve extends outward from body edge
  const sleeveExtend = 0.38 * (1.0 - smoothstep(sleeveY0, sleeveY1, sy));
  const sleeveHalfW = effectiveHalfW + sleeveExtend;
  const sleeveDist = Math.abs(sx) - sleeveHalfW;

  // Sleeve only visible in the vertical band [sleeveY0, sleeveY1]
  let inSleeve = (sy >= sleeveY0 && sy <= sleeveY1) ? sleeveDist : 999;

  // Union: body + sleeves
  let dist = Math.min(bodyDist, inSleeve);

  // Subtract collar V
  if (collarCut > 0) dist = Math.max(dist, collarCut - 0.02);

  return dist;
}

/* ─────────────────────────────────────────────────────────────────────
   FOLD LINES
   Subtle fabric fold marks — subtle horizontal/diagonal creases
   ───────────────────────────────────────────────────────────────────── */
function foldIntensity(nx, ny, angle, frame) {
  const sx = (nx - 0.5) / 0.34;
  const sy = (ny - 0.1) / 0.78;
  if (sy < 0 || sy > 1) return 0;

  // Chest fold (slight horizontal crease across chest area)
  const chestFold = Math.exp(-Math.pow((sy - 0.38) / 0.025, 2)) * 0.4;

  // Waist fold
  const waistFold = Math.exp(-Math.pow((sy - 0.6) / 0.018, 2)) * 0.25;

  // Diagonal drape fold (linen characteristic hang)
  const drapeFold = Math.exp(-Math.pow((sx * 0.7 + (sy - 0.5)) / 0.04, 2)) * 0.3
    * smoothstep(0.3, 0.7, sy);

  // Subtle vertical button placket
  const placket = Math.exp(-Math.pow(sx / 0.015, 2)) * 0.15 * smoothstep(0.15, 0.85, sy);

  return clamp(chestFold + waistFold + drapeFold + placket, 0, 1);
}

/* ─────────────────────────────────────────────────────────────────────
   RENDER FRAME
   ───────────────────────────────────────────────────────────────────── */
function renderFrame(frameIndex) {
  const t = frameIndex / (FRAMES - 1); // [0, 1]
  const easedT = easeInOutCubic(t);

  // Rotation arc: 0 → 140° (in radians), with a slight return at the end
  // Arc: front(0°) → ¾(45°) → side(70°) → ¾-back(110°) → partial-back(140°) (t=0.85)
  //   → smooth return back to ~120° (t=1.0) — cinematic ease-back
  let angleRad;
  if (easedT < 0.85) {
    angleRad = (easedT / 0.85) * (140 * Math.PI / 180);
  } else {
    // Gentle return: ease back ~20°
    const returnT = (easedT - 0.85) / 0.15;
    const smoothReturn = smoothstep(0, 1, returnT);
    angleRad = (140 - smoothReturn * 20) * Math.PI / 180;
  }

  // Light source: rotates opposite to shirt for rim-light continuity
  const lightAngle = -angleRad * 0.6 + Math.PI * 0.15;
  const lightX = Math.cos(lightAngle); // -1 = left, +1 = right
  const lightY = -0.35; // slightly above

  const pixels = new Uint8Array(W * H * 4);

  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const idx = (y * W + x) * 4;

      /* ── Background: deep cinematic black with subtle gradient ── */
      let bgL = 0.028; // base luminance
      // Subtle vertical gradient: slightly lighter at center-top
      bgL += smoothstep(0.3, 0.0, Math.abs(ny - 0.38)) * 0.018;
      // Horizontal center brightening (soft key fill)
      bgL += smoothstep(0.6, 0.0, Math.abs(nx - 0.5)) * 0.012;

      /* ── Vignette ── */
      const dx = (nx - 0.5) * 1.6;
      const dy = (ny - 0.5) * 1.2;
      const vigDist = dx * dx + dy * dy;
      const vignette = 1.0 - smoothstep(0.3, 1.1, vigDist);
      bgL *= vignette;

      /* ── Film grain ── */
      const grain = (hash(x * 3 + frameIndex * 7, y * 5 + frameIndex * 3) - 0.5) * 0.0015;

      /* ── Evaluate shirt SDF ── */
      const dist = shirtSDF(nx, ny, angleRad);
      const onShirt = dist < 0;
      const edgeSoftness = 0.004; // anti-alias width

      /* ── Shirt lighting ── */
      let shirtL = 0;
      if (onShirt || dist < edgeSoftness * 3) {
        // Base shirt: very dark matte black
        shirtL = 0.055;

        // --- Directional key light from upper-left/right based on rotation ---
        // Surface normal approximation: we use SDF gradient
        const eps = 0.002;
        const nx2 = (shirtSDF(nx + eps, ny, angleRad) - shirtSDF(nx - eps, ny, angleRad)) / (2 * eps);
        const ny2 = (shirtSDF(nx, ny + eps, angleRad) - shirtSDF(nx, ny - eps, angleRad)) / (2 * eps);
        const nlen = Math.sqrt(nx2 * nx2 + ny2 * ny2) + 1e-6;
        const normalX = nx2 / nlen, normalY = ny2 / nlen;

        const diffuse = clamp(normalX * lightX + normalY * lightY, 0, 1);
        shirtL += diffuse * 0.12;

        // --- Rim light: opposite side of key light, subtle ---
        const rimLightX = -lightX * 0.7;
        const rimDiffuse = clamp(normalX * rimLightX - normalY * 0.2, 0, 1);
        shirtL += rimDiffuse * 0.08;

        // --- Ambient fill: subtle, from above ---
        const ambientY = clamp(-normalY, 0, 1);
        shirtL += ambientY * 0.03;

        // --- Shoulder highlight: specular-like band at top ---
        const shoulderNy = (ny - 0.1) / 0.78;
        const shoulderHighlight = smoothstep(0.25, 0.08, Math.abs(shoulderNy - 0.18))
          * smoothstep(0.5, 0.0, Math.abs(nx - (0.5 + lightX * 0.15)))
          * 0.15;
        shirtL += shoulderHighlight;

        // --- Linen texture: low-frequency only (improves PNG compression) ---
        // Use coarse noise only — fine grain kills deflate ratio
        const linenNoise = valueNoise(nx * 18, ny * 22);
        const textureL = linenNoise;
        shirtL += (textureL - 0.5) * 0.018; // very subtle

        // --- Fabric folds: subtle darkening at crease lines ---
        const folds = foldIntensity(nx, ny, angleRad, frameIndex);
        shirtL -= folds * 0.025;

        // Edge anti-alias: blend shirt→background at silhouette
        const edgeBlend = dist < 0 ? 1.0 : 1.0 - smoothstep(0, edgeSoftness, dist);
        shirtL = lerp(bgL, shirtL, edgeBlend);
      } else {
        shirtL = bgL;
      }

      // Ground shadow: soft elliptical shadow below shirt hem
      const shadowCx = 0.5 + Math.sin(angleRad) * 0.03;
      const shadowNx = (nx - shadowCx) / 0.22;
      const shadowNy = (ny - 0.91) / 0.04;
      const shadowDist = shadowNx * shadowNx + shadowNy * shadowNy;
      const shadow = smoothstep(1.0, 0.0, shadowDist) * 0.06 * vignette;
      shirtL -= shadow;

      // Grain
      shirtL += grain;

      // Clamp and gamma-correct (sRGB approx)
      const finalL = clamp(shirtL, 0, 1);
      // Gamma 2.2 → linear correction for monitor display
      const gamma = Math.pow(finalL, 1 / 1.8); // slightly boosted for dark rendering

      // Quantise to ~6-bit levels to improve run-length in deflate
      const byteVal = Math.round(clamp(gamma, 0, 1) * 63) * 4;
      pixels[idx] = byteVal; // R
      pixels[idx + 1] = byteVal; // G
      pixels[idx + 2] = byteVal; // B
      pixels[idx + 3] = 255;     // A
    }
  }

  return pixels;
}

/* ─────────────────────────────────────────────────────────────────────
   MAIN: render all 60 frames
   ───────────────────────────────────────────────────────────────────── */
console.log(`[PANTHER] Generating ${FRAMES} cinematic frames at ${W}×${H}…`);
console.log(`[PANTHER] Output: ${OUT_DIR}`);
console.log('');

const startTime = Date.now();

for (let i = 0; i < FRAMES; i++) {
  const frameNum = String(i + 1).padStart(4, '0');
  const filePath = path.join(OUT_DIR, `frame_${frameNum}.webp`);

  process.stdout.write(`\r[PANTHER] Rendering frame ${i + 1}/${FRAMES}…`);

  const pixels = renderFrame(i);
  const png = encodePNG(pixels, W, H);
  fs.writeFileSync(filePath, png);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n[PANTHER] Done. ${FRAMES} frames written in ${elapsed}s.`);
console.log('[PANTHER] Hot-swap: replace files with real renders at any time.');
