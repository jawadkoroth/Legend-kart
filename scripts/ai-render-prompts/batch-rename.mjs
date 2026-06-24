/**
 * PANTHER — Batch rename AI-generated frames into sequence format.
 *
 * Usage:
 *   node scripts/ai-render-prompts/batch-rename.mjs <sourceDir> <outputDir>
 *
 * Example:
 *   node scripts/ai-render-prompts/batch-rename.mjs ./temp-renders ./public/sequences/linen-shirt
 *
 * Behaviour:
 *   - Reads all .webp, .png, .jpg, .jpeg files from sourceDir
 *   - Sorts them alphabetically (matches tool output order if frames are named 1.png, 2.png, etc.)
 *   - Renames and copies to outputDir as frame_0001.webp, frame_0002.webp, etc.
 *   - Does NOT overwrite if outputDir already has a frame with that name (use --force to override)
 *   - Prints a report of what was renamed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPPORTED = ['.webp', '.png', '.jpg', '.jpeg'];

const [,, sourceArg, outputArg, ...flags] = process.argv;
const force = flags.includes('--force');

if (!sourceArg || !outputArg) {
  console.error('Usage: node batch-rename.mjs <sourceDir> <outputDir> [--force]');
  process.exit(1);
}

const sourceDir = path.resolve(process.cwd(), sourceArg);
const outputDir = path.resolve(process.cwd(), outputArg);

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(sourceDir)
  .filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
  .sort(); // alphabetical — works for most AI tool outputs (1.png, 2.png, etc.)

if (files.length === 0) {
  console.error(`No supported image files found in ${sourceDir}`);
  process.exit(1);
}

console.log(`Found ${files.length} files in ${sourceDir}`);
console.log(`Output: ${outputDir}\n`);

let written = 0, skipped = 0;

files.forEach((file, i) => {
  const frameNum = String(i + 1).padStart(4, '0');
  const outName = `frame_${frameNum}.webp`;
  const srcPath = path.join(sourceDir, file);
  const dstPath = path.join(outputDir, outName);

  if (fs.existsSync(dstPath) && !force) {
    console.log(`  SKIP  ${file} → ${outName} (already exists, use --force to overwrite)`);
    skipped++;
    return;
  }

  fs.copyFileSync(srcPath, dstPath);
  console.log(`  OK    ${file} → ${outName}`);
  written++;
});

console.log(`\nDone. Written: ${written}, Skipped: ${skipped}`);
if (files.length > 60) {
  console.warn(`\nWARNING: ${files.length} frames found but engine is configured for 60.`);
  console.warn('Update SEQUENCE_CONFIG.frameCount in ProductStorySection.tsx if needed.');
}
