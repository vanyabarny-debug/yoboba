import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

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
  const recommendations = recsRaw
    ? [...recsRaw.matchAll(/'([^']+)'/g)].map((x) => x[1])
    : [];
  rows.push({
    id,
    name,
    price: Number(price),
    category,
    image_url: imgMap[imgKey] || '/images/menu/bt1.svg',
    recommendations,
  });
}

function uuid(id) {
  const h = createHash('sha256').update(`yoboba-menu:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const idMap = Object.fromEntries(rows.map((r) => [r.id, uuid(r.id)]));

let sql = `-- полное меню yoboba (запустить в sql editor после schema.sql)
delete from public.menu;

`;

for (const r of rows) {
  const rec = r.recommendations.length
    ? `ARRAY[${r.recommendations.map((x) => `'${idMap[x]}'`).join(', ')}]::uuid[]`
    : `'{}'::uuid[]`;
  const name = r.name.replace(/'/g, "''");
  sql += `insert into public.menu (id, name, price, image_url, category, is_available, recommendations) values ('${idMap[r.id]}', '${name}', ${r.price}, '${r.image_url}', '${r.category}', true, ${rec});\n`;
}

writeFileSync('supabase/seed-menu.sql', sql);
console.log(`seed-menu.sql: ${rows.length} items`);
