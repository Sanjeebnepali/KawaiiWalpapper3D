/**
 * Upload staged/ to Supabase Storage (public bucket). Run AFTER optimize.
 *
 *   $env:SUPABASE_SERVICE_KEY = "<service_role key from Supabase dashboard>"
 *   npm run upload --prefix C:\Walpapper\image-pipeline
 *
 * Uses the service_role key (full access) — needed because the app's anon
 * key can't write to Storage. The key is read from the environment only;
 * it is never written to disk or committed.
 */
const fs = require('fs');
const path = require('path');
const { PROJECT_REF, BUCKET } = require('./mapping');

const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error('Set SUPABASE_SERVICE_KEY in the environment first.');
  process.exit(1);
}
const BASE = `https://${PROJECT_REF}.supabase.co`;
const STAGED = path.join(__dirname, 'staged');

async function ensureBucket() {
  const res = await fetch(`${BASE}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok) console.log(`bucket "${BUCKET}" created (public).`);
  else console.log(`bucket "${BUCKET}": ${res.status} ${(await res.text()).slice(0, 160)} (ok if "already exists")`);
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function run() {
  if (!fs.existsSync(STAGED)) { console.error('No staged/ — run optimize first.'); process.exit(1); }
  await ensureBucket();
  const files = walk(STAGED);
  let ok = 0; let fail = 0;
  for (const fp of files) {
    const rel = path.relative(STAGED, fp).split(path.sep).join('/');
    const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${rel}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
      body: fs.readFileSync(fp),
    });
    if (res.ok) { ok += 1; if (ok % 50 === 0) console.log(`  uploaded ${ok}/${files.length}...`); }
    else { fail += 1; console.warn(`  FAIL ${rel}: ${res.status} ${(await res.text()).slice(0, 120)}`); }
  }
  console.log(`\nUploaded ${ok}, failed ${fail}, of ${files.length}.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
