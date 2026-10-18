import { effective_card_size, type material, type tech_card } from '@/lib/finance/model';
import { card_steps_base_ml, resolved_card_prep_steps } from '@/lib/finance/prep-steps';

/** реквизиты ИП для шапки ТТК */
export const TTK_ORG = {
  title: 'Индивидуальный предприниматель',
  fullName: 'Башмаков Иван Сергеевич',
  shortName: 'Башмаков И. С.',
  inn: '691010482503',
  ogrnip: '326690000032912',
  scope: 'Общественное питание (ИП Башмаков Иван Сергеевич)',
} as const;

const RAW_REQUIREMENTS =
  'Продовольственное сырье, пищевые продукты и полуфабрикаты соответствуют требованиям Технических регламентов Таможенного союза (ТР ТС 021/2011, ТР ТС 033/2013, ТР ТС 022/2011), действующих ГОСТ и ТУ, и имеют документы, подтверждающие их качество и безопасность.';

const DEFAULT_SHELF =
  'Реализовать сразу после приготовления (срок годности — не более 1 часа).';

/** ручные поля разделов 4–6 */
export type ttk_nutrition_row = {
  protein: string;
  fat: string;
  carbs: string;
  energy: string;
};

export type ttk_fill = {
  appearance: string;
  color: string;
  taste: string;
  consistency: string;
  /** температура подачи — опционально */
  serveTemp?: string;
  storage: string;
  /** ключ = объём мл */
  nutrition: Record<string, ttk_nutrition_row>;
};

export function empty_ttk_fill(vols: string[]): ttk_fill {
  const nutrition: Record<string, ttk_nutrition_row> = {};
  for (const v of vols) {
    nutrition[v] = { protein: '', fat: '', carbs: '', energy: '' };
  }
  return {
    appearance: '',
    color: '',
    taste: '',
    consistency: '',
    serveTemp: '',
    storage: '',
    nutrition,
  };
}

function ru_date(d = new Date()) {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}

export type ttk_temp_mode = 'cold' | 'hot';

/** какие температурные варианты выпускать в ТТК */
export function card_ttk_temps(card: tech_card): ttk_temp_mode[] {
  const cold = card.cold !== false;
  const hot = card.hot === true;
  if (cold && hot) return ['cold', 'hot'];
  if (hot && !cold) return ['hot'];
  return ['cold'];
}

function temp_word(mode: ttk_temp_mode) {
  return mode === 'hot' ? 'горячий' : 'холодный';
}

export function ttk_volume_keys(card: tech_card, materials: material[]) {
  const keys = Object.keys(card.sizes)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  if (keys.length) return keys;
  const fallback = ['500', '650'].filter((k) => effective_card_size(card, k, materials));
  return fallback.length ? fallback : ['500'];
}

function qty_cell(qty: number | undefined) {
  if (qty == null || !(qty > 0)) return '—';
  const n = Math.round(qty * 10) / 10;
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

function material_name(mat: material | undefined, id: string) {
  return mat?.name?.trim() || id;
}

function dish_name(card: tech_card, vols: string[], mode: ttk_temp_mode) {
  const vol_text =
    vols.length > 1
      ? `объемы ${vols.map((v) => `${v} мл`).join(' и ')}`
      : vols[0]
        ? `объем ${vols[0]} мл`
        : 'объем по рецепту';
  return `Напиток безалкогольный «${card.name}» (${temp_word(mode)}), ${vol_text}`;
}

function size_mass_g(size: { ingredients: Record<string, number> } | undefined) {
  if (!size) return 0;
  let sum = 0;
  for (const q of Object.values(size.ingredients)) {
    const n = Number(q);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 10) / 10;
}

function grams_label(qty: number) {
  const n = Math.round(qty * 10) / 10;
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${s} г`;
}

function recipe_rows(card: tech_card, materials: material[], vols: string[]) {
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const sizes = vols.map((k) => ({ key: k, size: effective_card_size(card, k, materials) }));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const { size } of sizes) {
    if (!size) continue;
    for (const id of Object.keys(size.ingredients)) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }

  const lines: string[] = [];
  lines.push(
    ['Наименование сырья и полуфабрикатов', ...vols.map((v) => `Выход ${v} мл (Брутто/Нетто, г)`)].join(
      '\t'
    )
  );
  for (const id of ids) {
    const mat = by_id.get(id);
    const cells = sizes.map(({ size }) => qty_cell(size?.ingredients[id]));
    lines.push([material_name(mat, id), ...cells].join('\t'));
  }
  lines.push(
    [
      'Масса готового продукта (выход):',
      ...sizes.map(({ size, key }) => {
        const sum = size_mass_g(size);
        if (sum > 0) return `${qty_cell(sum)} г`;
        const n = Number(key);
        return Number.isFinite(n) && n > 0 ? `${n} г` : '—';
      }),
    ].join('\t')
  );
  return lines.join('\n');
}

function process_section(card: tech_card, materials: material[]) {
  const steps = resolved_card_prep_steps(card, materials);
  if (!steps.length) {
    return [
      'Подготовка: [заполнить: подготовка посуды и полуфабрикатов].',
      '',
      'Сборка и подача: [заполнить: порядок закладки, смешивания и подачи].',
    ].join('\n');
  }

  const vols = ttk_volume_keys(card, materials);
  const base_ml = card_steps_base_ml(card);
  const dual = vols.length > 1;

  return steps
    .map((s) => {
      const title = (s.title.trim() || 'шаг').replace(/^./, (c) => c.toUpperCase());
      const hint = (s.hint || '').trim();
      if (!(s.qty > 0)) {
        return hint ? `${title}: ${hint}.` : `${title}.`;
      }
      const qty_part = (() => {
        if (!dual) return grams_label(s.qty);
        const parts = vols.map((v) => {
          const ml = Number(v) || base_ml;
          const q =
            Math.abs(ml - base_ml) < 0.001
              ? s.qty
              : Math.round(((s.qty * ml) / base_ml) * 10) / 10;
          return grams_label(q);
        });
        return `${parts.join(' / ')} (на ${vols.map((v) => `${v} мл`).join(' / ')})`;
      })();
      return hint
        ? `${title}: ${hint} — ${qty_part}.`
        : `${title}: ${qty_part}.`;
    })
    .join('\n\n');
}

function cell_or_stub(v: string | undefined) {
  const t = (v || '').trim();
  return t || '[заполнить]';
}

/** температура подачи под холодный / горячий вариант ТТК */
function resolve_serve_temp(mode: ttk_temp_mode, raw?: string) {
  const s = (raw || '').trim();
  if (mode === 'hot') {
    const from_dual = s.match(/горяч[^0-9]*(\d+\s*[–\-]\s*\d+\s*°\s*C)/i);
    if (from_dual) return from_dual[1].replace(/\s*°\s*C/i, ' °C');
    if (s && !/холодн|льдом/i.test(s)) return s;
    return '60–65 °C';
  }
  const from_dual = s.match(/холодн[^;]*?(со льдом[^;]*|\d+\s*[–\-]\s*\d+\s*°\s*C)/i);
  if (from_dual) {
    const part = from_dual[1].trim();
    return /°/.test(part) ? part.replace(/\s*°\s*C/i, ' °C') : `${part}, 4–8 °C`;
  }
  if (s && !/горяч/i.test(s)) return s;
  return 'со льдом, 4–8 °C';
}

function nutrition_table(vols: string[], fill?: ttk_fill) {
  const header = ['Показатель', ...vols.map((v) => `На порцию ${v} мл`)].join('\t');
  const row = (label: string, pick: (r: ttk_nutrition_row | undefined) => string) =>
    [label, ...vols.map((v) => cell_or_stub(pick(fill?.nutrition?.[v])))].join('\t');
  return [
    header,
    row('Белки, г', (r) => r?.protein || ''),
    row('Жиры, г', (r) => r?.fat || ''),
    row('Углеводы, г', (r) => r?.carbs || ''),
    row('Энергетическая ценность, ккал / кДж', (r) => r?.energy || ''),
  ].join('\n');
}

export type build_ttk_opts = {
  card: tech_card;
  materials: material[];
  /** № карты; если не задан — 1 */
  number?: number;
  /** дата утверждения */
  date?: Date;
  /** ручные разделы 4–6 */
  fill?: ttk_fill;
  /** принудительный температурный вариант */
  temp?: ttk_temp_mode;
};

/** полный текст одной ТТК (один температурный вариант) */
export function build_ttk_text(opts: build_ttk_opts): string {
  const { card, materials, fill } = opts;
  const temps = card_ttk_temps(card);
  const mode = opts.temp && temps.includes(opts.temp) ? opts.temp : temps[0] || 'cold';
  const number = Math.max(1, Math.round(opts.number || 1));
  const vols = ttk_volume_keys(card, materials);
  const date = ru_date(opts.date);

  const appearance = cell_or_stub(fill?.appearance);
  const color = cell_or_stub(fill?.color);
  const taste = cell_or_stub(fill?.taste);
  const consistency = cell_or_stub(fill?.consistency);
  const serve = resolve_serve_temp(mode, fill?.serveTemp);
  const storage = cell_or_stub(fill?.storage);
  const shelf = DEFAULT_SHELF;

  const quality = [
    `Внешний вид: ${appearance}`,
    '',
    `Цвет: ${color}`,
    '',
    `Вкус и запах: ${taste}`,
    '',
    `Консистенция: ${consistency}`,
    '',
    `Температура подачи: ${serve}`,
  ];

  const parts = [
    'ТТК',
    `${card.name} (${temp_word(mode)})`,
    '',
    'УТВЕРЖДАЮ',
    TTK_ORG.title,
    TTK_ORG.fullName,
    `ИНН: ${TTK_ORG.inn}`,
    `ОГРНИП: ${TTK_ORG.ogrnip}`,
    '',
    `Подпись: __________________ / ${TTK_ORG.shortName}`,
    `Дата: ${date}`,
    '',
    `ТЕХНИКО-ТЕХНОЛОГИЧЕСКАЯ КАРТА № ${number}`,
    '',
    `Наименование блюда (изделия): ${dish_name(card, vols, mode)}`,
    '',
    `Область применения: ${TTK_ORG.scope}`,
    '',
    '1. ТРЕБОВАНИЯ К СЫРЬЮ',
    RAW_REQUIREMENTS,
    '',
    '2. РЕЦЕПТУРА',
    '',
    recipe_rows(card, materials, vols),
    '',
    '3. ТЕХНОЛОГИЧЕСКИЙ ПРОЦЕСС (СП 2.3.6.3668-20, СанПиН 2.3/2.4.3590-20)',
    '',
    process_section(card, materials),
    '',
    '4. ПОКАЗАТЕЛИ КАЧЕСТВА И БЕЗОПАСНОСТИ',
    '',
    ...quality,
    '',
    '5. УСЛОВИЯ ХРАНЕНИЯ И РЕАЛИЗАЦИИ',
    '',
    `Срок реализации: ${shelf}`,
    '',
    `Сроки хранения полуфабрикатов: ${storage}`,
    '',
    '6. ПИЩЕВАЯ И ЭНЕРГЕТИЧЕСКАЯ ЦЕННОСТЬ (РАСЧЕТНАЯ)',
    '',
    nutrition_table(vols, fill),
    '',
    `Разработчик: __________________ / ${TTK_ORG.shortName}`,
    '',
  ];

  return parts.join('\n');
}

const TTK_SPLIT = '\n\n────────────────────────────────\n\n';

/**
 * все температурные варианты карты: cold+hot → две ТТК подряд в буфер.
 * номера: number, number+1, …
 */
export function build_ttk_bundle(opts: build_ttk_opts): string {
  const temps = card_ttk_temps(opts.card);
  const base = Math.max(1, Math.round(opts.number || 1));
  return temps
    .map((temp, i) => build_ttk_text({ ...opts, temp, number: base + i }))
    .join(TTK_SPLIT);
}

/** номер карты = позиция среди напитков (1-based) */
export function ttk_card_number(cards: tech_card[], card_id: string) {
  const idx = cards.findIndex((c) => c.id === card_id);
  return idx >= 0 ? idx + 1 : cards.length + 1;
}

export function ttk_fill_ready(fill: ttk_fill) {
  return Boolean(
    fill.appearance.trim() &&
      fill.color.trim() &&
      fill.taste.trim() &&
      fill.consistency.trim() &&
      fill.storage.trim()
  );
}

export async function copy_ttk_to_clipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('буфер обмена недоступен');
  }
  await navigator.clipboard.writeText(text);
}
