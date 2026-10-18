import { readFileSync, writeFileSync } from 'fs';
import { normalize_finance_state } from '../src/lib/finance/model';
import { ensure_prep_materials } from '../src/lib/finance/prep-stations';
import { hydrate_ttk_finance } from '../src/lib/finance/ttk-presets';

const path = 'data/finance-state.json';
const raw = JSON.parse(readFileSync(path, 'utf8'));
const state = hydrate_ttk_finance(ensure_prep_materials(normalize_finance_state(raw)), true);
writeFileSync(path, JSON.stringify(state, null, 2));

const sum = (ing: Record<string, number> | undefined) =>
  Object.values(ing || {}).reduce((a, b) => a + Number(b || 0), 0);

console.log(
  'aux:',
  ['ice', 'water', 'rose_water']
    .map((id) => {
      const m = state.materials.find((x) => x.id === id);
      return m ? `${id}=${m.name}` : `${id}=MISSING`;
    })
    .join(' | ')
);
console.log(
  'legacy:',
  state.materials.filter((m) => /^mat_mv4/.test(m.id)).map((m) => m.id)
);

for (const c of state.techCards) {
  const s500 = c.sizes['500'];
  const ice = s500?.ingredients?.ice;
  const water = s500?.ingredients?.water;
  console.log(
    c.name,
    'ice',
    ice ?? '—',
    'water',
    water ?? '—',
    'sum',
    sum(s500?.ingredients),
    '650ice',
    c.sizes['650']?.ingredients?.ice ?? '—'
  );
}
const rose = state.techCards.find((c) => /роз/i.test(c.name));
console.log('rose_water', rose?.sizes['500']?.ingredients?.rose_water);
