import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function load_env() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const src = readFileSync('src/lib/menu-store.ts', 'utf8');
const imgMap = {};
for (const m of src.matchAll(/(\w+):\s*local\('([^']+)'\)/g)) {
  imgMap[m[1]] = `/images/menu/${m[2]}.svg`;
}

const block = src.slice(
  src.indexOf('export const default_menu_items'),
  src.indexOf('export type menu_store')
);
const re =
  /item\('([^']+)',\s*'([^']+)',\s*(\d+),\s*'([^']+)',\s*img\.(\w+)(?:,\s*\[([^\]]*)\])?\)/g;

const rows = [];
let m;
while ((m = re.exec(block))) {
  const [, id, name, price, category, imgKey, recsRaw] = m;
  rows.push({
    id,
    name,
    price: Number(price),
    category,
    image_url: imgMap[imgKey] || '/images/menu/bt1.svg',
    recommendations: recsRaw
      ? [...recsRaw.matchAll(/'([^']+)'/g)].map((x) => x[1])
      : [],
  });
}

function uuid(id) {
  const h = createHash('sha256').update(`yoboba-menu:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const idMap = Object.fromEntries(rows.map((r) => [r.id, uuid(r.id)]));

const env = load_env();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const payload = rows.map((r) => ({
  id: idMap[r.id],
  name: r.name,
  price: r.price,
  image_url: r.image_url,
  category: r.category,
  is_available: true,
  recommendations: r.recommendations.map((x) => idMap[x]),
}));

const { error: delete_error } = await supabase.from('menu').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (delete_error) {
  console.error('delete failed', delete_error.message);
  process.exit(1);
}

const { error: insert_error } = await supabase.from('menu').insert(payload);
if (insert_error) {
  console.error('insert failed', insert_error.message);
  process.exit(1);
}

console.log(`seeded ${payload.length} menu items`);
