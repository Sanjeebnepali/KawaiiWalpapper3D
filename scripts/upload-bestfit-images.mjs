/**
 * One-off: upload the owner's hand-picked category folders + the 2D headline
 * into the existing public `wallpapers` bucket, at the paths the catalog +
 * Best-Fit grid reference. Run with the service_role key (read from .env).
 *
 *   node scripts/upload-bestfit-images.mjs
 *
 * Idempotent (upsert). Skips accidental " (1)" copies.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const BUCKET = 'wallpapers';
const DL = 'C:\\Users\\Sanju\\Downloads';

// localFolder (under Downloads) → destination prefix inside the bucket.
const MAP = [
  ['painting ---walpapper', 'category/painting'],
  ['football--walpapper', 'category/football'],
  ['studying--walpapper', 'category/studying'],
  ['dance--walpapper', 'category/dance'],
  ['cooking--walpapper', 'category/cooking'],
  ['gardening--walpapper', 'category/gardening'],
  ['playing--game', 'category/playing-game'],
  ['nervus--2d--walpapper', '2d/nervous'],
];

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const re = new RegExp('^' + name + '\\s*=\\s*(.+)\\s*$', 'm');
    const m = readFileSync('.env', 'utf8').match(re);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}
function jwtRole(key) {
  try {
    const p = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(p, 'base64').toString()).role ?? null;
  } catch {
    return null;
  }
}
function contentTypeFor(f) {
  const e = extname(f).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function main() {
  const url = readEnv('SUPABASE_URL') || readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env or env).');
    process.exit(1);
  }
  if (jwtRole(key) !== 'service_role') {
    console.error('✗ SUPABASE_SERVICE_ROLE_KEY is not a service_role key.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let total = 0;
  let failed = 0;
  for (const [folder, prefix] of MAP) {
    const dir = join(DL, folder);
    if (!existsSync(dir)) {
      console.error(`✗ Folder missing: ${dir}`);
      continue;
    }
    const files = readdirSync(dir)
      .filter((f) => ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(f).toLowerCase()))
      .filter((f) => !f.includes(' (1)'));
    let ok = 0;
    for (const file of files) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${prefix}/${file}`, readFileSync(join(dir, file)), {
          contentType: contentTypeFor(file),
          upsert: true,
        });
      if (error) {
        failed++;
        console.error(`  ✗ ${prefix}/${file} — ${error.message}`);
      } else {
        ok++;
        total++;
      }
    }
    console.log(`${prefix}: ${ok}/${files.length} uploaded`);
  }
  console.log(`\nDone: ${total} uploaded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('✗ Failed:', e?.message ?? e);
  process.exit(1);
});
