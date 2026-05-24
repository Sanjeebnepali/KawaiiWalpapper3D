/**
 * Upload ONE local image into the existing public `wallpapers` Supabase bucket
 * at a given path. For one-off additions (e.g. the Featured 2D Kawaii headline).
 *
 * Usage (PowerShell), with the SERVICE ROLE key (the anon key can't write):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"
 *   node scripts/upload-file.mjs `
 *     "C:\Users\Sanju\Downloads\nervus--2d--walpapper\33bfb1fb-45c8-4eaa-8092-7f426b8040ac.png" `
 *     "2d/nervous/33bfb1fb-45c8-4eaa-8092-7f426b8040ac.png"
 *
 * Arg 1 = local file path. Arg 2 = destination path inside the `wallpapers`
 * bucket. Prints the public URL on success. Idempotent (upsert).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

const BUCKET = 'wallpapers';

// Read an env var: process.env first, else the (gitignored) .env file. Lets you
// keep SUPABASE_SERVICE_ROLE_KEY in .env so the script can run without exporting
// it each time. .env is never committed.
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
    const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

function contentTypeFor(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function main() {
  const url = readEnv('SUPABASE_URL') || readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const localPath = process.argv[2];
  const destPath = process.argv[3];

  if (!url) {
    console.error('✗ No Supabase URL ($env:SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in .env).');
    process.exit(1);
  }
  if (!key) {
    console.error('✗ Set $env:SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role).');
    process.exit(1);
  }
  const role = jwtRole(key);
  if (role && role !== 'service_role') {
    console.error(`✗ That key's role is "${role}", not "service_role" — it can't upload.`);
    process.exit(1);
  }
  if (!localPath || !destPath) {
    console.error('✗ Usage: node scripts/upload-file.mjs <localFile> <destPathInBucket>');
    process.exit(1);
  }
  if (!existsSync(localPath)) {
    console.error(`✗ File not found: ${localPath}`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destPath, readFileSync(localPath), {
      contentType: contentTypeFor(localPath),
      upsert: true,
    });
  if (error) {
    console.error('✗ Upload failed:', error.message);
    process.exit(1);
  }
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${destPath}`;
  console.log('✓ Uploaded.');
  console.log(`Public URL:\n  ${publicUrl}`);
}

main().catch((e) => {
  console.error('✗ Failed:', e?.message ?? e);
  process.exit(1);
});
