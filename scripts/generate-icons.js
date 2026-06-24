/**
 * PANTHER Icon Generator
 * 
 * Converts public/icons/icon.svg into all required PNG sizes for PWA
 * 
 * Usage:
 *   npm install sharp
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  try {
    const sharp = require('sharp');
    const svgBuffer = fs.readFileSync(path.join(__dirname, '../public/icons/icon.svg'));

    for (const size of SIZES) {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, `../public/icons/icon-${size}x${size}.png`));
      console.log(`Generated icon-${size}x${size}.png`);
    }

    // Generate shortcut icons
    await sharp(svgBuffer)
      .resize(96, 96)
      .png()
      .toFile(path.join(__dirname, '../public/icons/shortcut-orders.png'));
    console.log('Generated shortcut-orders.png');

    await sharp(svgBuffer)
      .resize(96, 96)
      .png()
      .toFile(path.join(__dirname, '../public/icons/shortcut-dashboard.png'));
    console.log('Generated shortcut-dashboard.png');

    console.log('\nAll icons generated successfully!');
  } catch (err) {
    console.error('Error generating icons:', err.message);
    console.log('\nMake sure to install sharp: npm install --save-dev sharp');
    process.exit(1);
  }
}

generateIcons();
