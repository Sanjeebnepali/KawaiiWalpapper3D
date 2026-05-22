/**
 * Read every mapped Downloads folder, convert each image to WebP at phone
 * resolution, write to staged/<group>/<key>/NNN.webp, and emit manifest.json
 * (the input for gen-catalog + upload). Originals are never modified.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  SRC_ROOT, PROJECT_REF, BUCKET, TARGET_WIDTH, WEBP_QUALITY, FOLDERS, publicUrl,
} = require('./mapping');

const STAGED = path.join(__dirname, 'staged');
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

async function run() {
  // Fresh staged/ each run so removed/renamed source files don't linger.
  fs.rmSync(STAGED, { recursive: true, force: true });

  const manifest = { bucket: BUCKET, projectRef: PROJECT_REF, generatedAt: new Date().toISOString(), groups: {} };
  let total = 0;
  let totalBytes = 0;

  for (const f of FOLDERS) {
    const srcDir = path.join(SRC_ROOT, f.src);
    if (!fs.existsSync(srcDir)) {
      console.warn(`MISSING (skipped): ${f.src}`);
      continue;
    }
    const files = fs.readdirSync(srcDir)
      .filter((n) => IMG_EXT.has(path.extname(n).toLowerCase()))
      .sort();

    const outDir = path.join(STAGED, f.group, f.key);
    fs.mkdirSync(outDir, { recursive: true });

    const items = [];
    let i = 0;
    for (const name of files) {
      i += 1;
      const outName = `${String(i).padStart(3, '0')}.webp`;
      const outPath = path.join(outDir, outName);
      try {
        await sharp(path.join(srcDir, name))
          .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(outPath);
      } catch (e) {
        console.warn(`  ! failed ${f.src}/${name}: ${e.message}`);
        continue;
      }
      totalBytes += fs.statSync(outPath).size;
      items.push({ id: `${f.group}-${f.key}-${i}`, file: outName, url: publicUrl(f.group, f.key, outName) });
    }

    manifest.groups[f.group] = manifest.groups[f.group] || {};
    manifest.groups[f.group][f.key] = { label: f.label, tier: f.tier, count: items.length, items };
    total += items.length;
    console.log(`${f.group}/${f.key.padEnd(16)} ${items.length} imgs`);
  }

  fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDONE: ${total} images → ${(totalBytes / 1024 / 1024).toFixed(1)} MB staged (was ~777 MB PNG).`);
  console.log('manifest.json written.');
}

run().catch((e) => { console.error(e); process.exit(1); });
