// Build labeled contact-sheet montages of every staged image so they can be
// visually audited for AI-generation defects (hands, fingers, limbs, faces).
// Output: image-pipeline/_audit/<group>_<folder>_<part>.png + index.json mapping.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const STAGED = path.join(__dirname, 'staged');
// argv: cols perSheet tile outDir groupsCSV
const COLS = parseInt(process.argv[2] || '4', 10);
const MAX_PER_SHEET = parseInt(process.argv[3] || '20', 10);
const TILE = parseInt(process.argv[4] || '380', 10);
const OUT = path.join(__dirname, process.argv[5] || '_audit');
const groups = (process.argv[6] || '2d,category,mood').split(',');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const LABEL_H = 30;      // label strip height
const mapping = {}; // sheetName -> [{idx, file}]

(async () => {
  for (const grp of groups) {
    const grpDir = path.join(STAGED, grp);
    if (!fs.existsSync(grpDir)) continue;
    const folders = fs.readdirSync(grpDir).filter(f =>
      fs.statSync(path.join(grpDir, f)).isDirectory());

    for (const folder of folders) {
      const dir = path.join(grpDir, folder);
      const files = fs.readdirSync(dir)
        .filter(f => /\.(webp|png|jpe?g)$/i.test(f))
        .sort();

      // chunk into sheets
      for (let part = 0; part * MAX_PER_SHEET < files.length; part++) {
        const chunk = files.slice(part * MAX_PER_SHEET, (part + 1) * MAX_PER_SHEET);
        const rows = Math.ceil(chunk.length / COLS);
        const cellW = TILE;
        const cellH = TILE + LABEL_H;
        const W = COLS * cellW;
        const H = rows * cellH;

        const base = sharp({
          create: { width: W, height: H, channels: 3, background: { r: 18, g: 18, b: 18 } },
        });

        const composites = [];
        const sheetName = `${grp}_${folder}${files.length > MAX_PER_SHEET ? `_p${part + 1}` : ''}`;
        mapping[sheetName] = [];

        for (let i = 0; i < chunk.length; i++) {
          const globalIdx = part * MAX_PER_SHEET + i + 1; // 1-based within folder
          const file = chunk[i];
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const x = col * cellW;
          const y = row * cellH;

          const img = await sharp(path.join(dir, file))
            .resize(TILE, TILE, { fit: 'contain', background: { r: 30, g: 30, b: 30 } })
            .toBuffer();
          composites.push({ input: img, left: x, top: y });

          // label strip with index + filename
          const shortName = file.length > 30 ? file.slice(0, 27) + '…' : file;
          const label = Buffer.from(
            `<svg width="${cellW}" height="${LABEL_H}">
               <rect width="100%" height="100%" fill="#000"/>
               <text x="6" y="23" font-family="monospace" font-size="20" font-weight="bold" fill="#fab3ca">#${globalIdx}</text>
               <text x="56" y="22" font-family="monospace" font-size="15" fill="#bbb">${shortName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
             </svg>`);
          composites.push({ input: label, left: x, top: y + TILE });

          mapping[sheetName].push({ idx: globalIdx, file });
        }

        await base.composite(composites).png().toFile(path.join(OUT, `${sheetName}.png`));
        console.log(`wrote ${sheetName}.png (${chunk.length} tiles)`);
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(mapping, null, 2));
  console.log('DONE. sheets in', OUT);
})();
