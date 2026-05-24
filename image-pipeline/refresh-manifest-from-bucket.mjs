/**
 * Refresh image-pipeline/manifest.json from the LIVE `wallpapers` bucket, so
 * every uploaded image (numbered originals + hand-added UUID files) is listed.
 * Keeps each section's label/tier/order; rebuilds `items` from the bucket.
 *
 *   node image-pipeline/refresh-manifest-from-bucket.mjs
 *   node image-pipeline/gen-catalog.js     # then regenerate the .ts
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (anon can't list). Read-only on the bucket.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = readFileSync(join(ROOT, '.env'), 'utf8').match(
      new RegExp('^' + name + '\\s*=\\s*(.+)\\s*$', 'm'),
    );
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const url = readEnv('SUPABASE_URL') || readEnv('EXPO_PUBLIC_SUPABASE_URL');
const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('✗ Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const BASE = `${url}/storage/v1/object/public/wallpapers`;
const manifestPath = join(HERE, 'manifest.json');
const m = JSON.parse(readFileSync(manifestPath, 'utf8'));

const isImg = (n) => /\.(webp|png|jpe?g)$/i.test(n);
const numbered = (n) => /^\d+\.(webp|png|jpe?g)$/i.test(n);
// Numbered originals first (by number), then the rest (UUID uploads) — keeps
// existing `<group>-<key>-N` ids stable and appends new files.
function sortFiles(files) {
  const a = files.filter(numbered).sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
  const b = files.filter((f) => !numbered(f)).sort();
  return [...a, ...b];
}

let grand = 0;
for (const group of ['mood', 'category', '2d']) {
  for (const k of Object.keys(m.groups[group] || {})) {
    const { data, error } = await sb.storage.from('wallpapers').list(`${group}/${k}`, { limit: 2000 });
    if (error) { console.error(`  ! ${group}/${k}: ${error.message}`); continue; }
    const files = sortFiles((data || []).filter((x) => x.id !== null && isImg(x.name)).map((x) => x.name));
    m.groups[group][k].items = files.map((file, i) => ({
      id: `${group}-${k}-${i + 1}`,
      file,
      url: `${BASE}/${group}/${k}/${file}?v=2`,
    }));
    grand += files.length;
    console.log(`${group}/${k}: ${files.length}`);
  }
}
writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
console.log(`\nmanifest updated — ${grand} photos across all sections.`);
