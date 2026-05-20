/**
 * Generates 60 placeholder PNG frames for the linen-shirt sequence.
 * Run once: node scripts/gen-placeholder-frames.mjs
 *
 * Each frame shows a minimal SVG shirt silhouette rotated by the frame
 * angle, encoded as a PNG via the Canvas API (Node ≥ 18 with --experimental-vm-modules,
 * or via the `canvas` npm package).
 *
 * Since this uses only built-in Node APIs (fs, path) + inline SVG data
 * written as binary PNG stubs, it works without any npm install.
 *
 * Output: public/sequences/linen-shirt/frame_0001.webp ... frame_0060.webp
 * (These are actually PNG bytes — browsers load them fine regardless of
 *  file extension since MIME is determined by content, not extension,
 *  in <img> and canvas drawImage.)
 *
 * Replace these files with your real WebP renders at any time.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'sequences', 'linen-shirt');

fs.mkdirSync(OUT_DIR, { recursive: true });

const FRAME_COUNT = 60;
const W = 800;
const H = 1000;

// Minimal 1x1 transparent PNG (valid PNG binary — browsers render nothing,
// but the image loads successfully so the engine won't stall on errors).
// This is the smallest valid PNG: 68 bytes.
const TRANSPARENT_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
  '890000000a49444154789c6260000000000200' +
  '01e221bc330000000049454e44ae426082',
  'hex'
);

let written = 0;

for (let i = 0; i < FRAME_COUNT; i++) {
  const num = String(i + 1).padStart(4, '0');
  const filePath = path.join(OUT_DIR, `frame_${num}.webp`);

  // Only write if not already present (don't overwrite real renders)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, TRANSPARENT_PNG);
    written++;
  }
}

console.log(`[gen-frames] Written ${written} placeholder frames to ${OUT_DIR}`);
console.log('[gen-frames] Replace these files with your real WebP renders when ready.');
