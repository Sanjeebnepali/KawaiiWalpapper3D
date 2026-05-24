/** List the `wallpapers` bucket tree (folders + file counts). Read-only.
 *  Uses SUPABASE_SERVICE_ROLE_KEY from .env (anon can't list). */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = readFileSync('.env', 'utf8').match(new RegExp('^' + name + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const url = readEnv('SUPABASE_URL') || readEnv('EXPO_PUBLIC_SUPABASE_URL');
const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'wallpapers';

const list = async (prefix) => {
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 2000 });
  if (error) { console.error(`  ! ${prefix}: ${error.message}`); return []; }
  return data;
};

let grand = 0;
const root = await list('');
console.log('ROOT folders/files:', root.map((x) => x.name).join(', '), '\n');
for (const f of root) {
  if (f.id !== null) { grand++; continue; } // top-level file
  const sub = await list(f.name);
  let folderTotal = 0;
  const lines = [];
  for (const s of sub) {
    if (s.id === null) {
      const files = await list(`${f.name}/${s.name}`);
      lines.push(`    ${s.name}: ${files.length}`);
      folderTotal += files.length;
    } else {
      folderTotal++;
    }
  }
  grand += folderTotal;
  console.log(`${f.name}/  — ${folderTotal} files`);
  lines.forEach((l) => console.log(l));
}
console.log(`\nGRAND TOTAL: ${grand} files`);
