import { readFileSync } from 'fs';
import { normalize_finance_state } from '../src/lib/finance/model';
import { build_ttk_text } from '../src/lib/finance/ttk-document';

const state = normalize_finance_state(JSON.parse(readFileSync('data/finance-state.json', 'utf8')));
const black = state.techCards.find((c) => c.id === 'tc_original-black-led')!;
const text = build_ttk_text({
  card: black,
  materials: state.materials,
  number: 1,
  temp: 'cold',
  fill: black.ttk,
});
const recipe = text.split('2. РЕЦЕПТУРА')[1]?.split('3. ТЕХНОЛОГИЧЕСКИЙ')[0] || '';
const proc = text.split('3. ТЕХНОЛОГИЧЕСКИЙ')[1]?.split('4. ПОКАЗАТЕЛИ')[0] || '';
console.log(recipe.trim());
console.log('---');
console.log(proc.trim().slice(0, 1000));
