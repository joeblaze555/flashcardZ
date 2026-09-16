// One-shot asset rasterizer: SVG masters -> production PNGs.
// Run: node scripts/render-assets.cjs  (requires devDependency `sharp`)
const sharp = require('sharp');

async function main() {
  await sharp('assets/icon.svg').resize(1024, 1024).png().toFile('assets/icon.png');
  await sharp('assets/adaptive-icon.svg').resize(1024, 1024).png().toFile('assets/adaptive-icon.png');
  await sharp('assets/splash.svg').resize(2048, 2048).png().toFile('assets/splash.png');

  for (const f of ['assets/icon.png', 'assets/adaptive-icon.png', 'assets/splash.png']) {
    console.log(f, JSON.stringify(await sharp(f).metadata()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
