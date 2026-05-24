/**
 * One-time uploader for the premium wallpaper collection → Supabase Storage.
 *
 * WHY a script (not the app): the app only ships the Supabase ANON key, which
 * can't create a bucket or bulk-upload. This runs with your SERVICE ROLE key,
 * which you keep OUT of the repo and the app bundle.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<your service_role key from Supabase
 *       → Project Settings → API>"
 *   node scripts/upload-premium.mjs "C:\Users\Sanju\Downloads\premium"
 *
 * The Supabase URL is read from $env:SUPABASE_URL, else from .env's
 * EXPO_PUBLIC_SUPABASE_URL. The folder arg defaults to the path above.
 *
 * It creates a PUBLIC bucket `premium` (if missing) and upserts every
 * .png/.jpg/.jpeg (skipping accidental " (1)" copies). Idempotent — safe to
 * re-run. The object names match constants/premiumCatalog.ts exactly, so the
 * app's URLs resolve as soon as this finishes.
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const BUCKET = 'premium';
const DEFAULT_FOLDER = 'C:\\Users\\Sanju\\Downloads\\premium';

function readEnvUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    const env = readFileSync('.env', 'utf8');
    const m = env.match(/^EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.+)\s*$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function main() {
  const url = readEnvUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const folder = process.argv[2] || DEFAULT_FOLDER;

  if (!url) {
    console.error('✗ No Supabase URL. Set $env:SUPABASE_URL or keep EXPO_PUBLIC_SUPABASE_URL in .env.');
    process.exit(1);
  }
  if (!key) {
    console.error('✗ Set $env:SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role).');
    process.exit(1);
  }
  if (!existsSync(folder)) {
    console.error(`✗ Folder not found: ${folder}`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Ensure a public bucket. createBucket errors if it already exists — ignore that.
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) {
    console.error('✗ Could not create bucket:', bucketErr.message);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" ready (public).`);

  const files = readdirSync(folder)
    .filter((f) => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .filter((f) => !f.includes(' (1)')); // skip accidental duplicate downloads

  let ok = 0;
  let failed = 0;
  for (const file of files) {
    const bytes = readFileSync(join(folder, file));
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file, bytes, { contentType: contentTypeFor(file), upsert: true });
    if (error) {
      failed++;
      console.error(`  ✗ ${file} — ${error.message}`);
    } else {
      ok++;
      process.stdout.write(`  ✓ ${ok}/${files.length}\r`);
    }
  }

  console.log(`\nDone: ${ok} uploaded, ${failed} failed.`);
  if (ok > 0) {
    const sample = `${url}/storage/v1/object/public/${BUCKET}/${files[0]}`;
    console.log(`Sample public URL:\n  ${sample}`);
    console.log('Open that in a browser — if the image loads, the app will too.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('✗ Upload failed:', e?.message ?? e);
  process.exit(1);
});
