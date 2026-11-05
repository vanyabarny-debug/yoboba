import type { menu_badge_color, menu_item } from '@/lib/types';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import type { heading_style } from '@/lib/heading-style';
import { default_category_heading_styles } from '@/lib/heading-style';
import {
  drop_item_category,
  item_categories,
  rename_item_category,
  set_item_categories,
} from '@/lib/menu-item-categories';

export const store_version = 111;

export const WARM_DRINKS_CATEGORY = 'тёплые напитки';
export const CLASSIC_CATEGORY = 'классика';
const folded_warm_categories = new Set(['матча & таро']);

/** снятые с меню эксперименты — не возвращать через merge */
export const dropped_menu_item_ids = new Set(['malinovy-fuz', 'taisky-chai']);

/** тёплые дубли: в меню и техкартах остаётся только вариант со льдом, без этой подписи */
const iced_only_ids = new Set(['original-black', 'jasmine-green']);

/** «со льдом» слили в одну карточку с cold+hot */
const dual_temp_led_ids = new Set(['matcha-latte-tiger-led', 'taro-led', 'cherny-karamel-led']);
const dual_temp_led_to_base: Record<string, string> = {
  'matcha-latte-tiger-led': 'matcha-latte-tiger',
  'taro-led': 'taro',
  'cherny-karamel-led': 'cherny-karamel',
};

/** позиции, снятые с меню — остаются в админской истории, но не публикуются на сайте */
export const retired_item_ids = new Set([
  'golubaya-laguna',
  'subzero',
  'tropichesky-limonad',
  'klubnichny-limonad',
  'nezhnaya-roza',
  ...dropped_menu_item_ids,
  ...iced_only_ids,
  ...dual_temp_led_ids,
]);
export const retired_item_names = new Set([
  'голубая лагуна',
  'сабзиро',
  'тропический фьюжн',
  'малиновый фуз',
  'клубничный лимонад',
  'нежная роза',
  'тайский чай',
]);

export function is_retired_menu_item(item: Pick<menu_item, 'id' | 'name'>): boolean {
  return (
    retired_item_ids.has(item.id) ||
    retired_item_names.has((item.name || '').trim().toLowerCase())
  );
}

export const default_categories = [
  WARM_DRINKS_CATEGORY,
  CLASSIC_CATEGORY,
  'лимонады',
  'на фруктовом пюре',
  'молочные',
  'напиток месяца',
  'комбо',
];

export function fold_warm_drink_categories(categories: string[]): string[] {
  const out: string[] = [];
  let warm_placed = false;
  let classic_placed = false;
  for (const category of categories) {
    if (folded_warm_categories.has(category) || category === WARM_DRINKS_CATEGORY) {
      if (!warm_placed) {
        out.push(WARM_DRINKS_CATEGORY);
        warm_placed = true;
      }
      continue;
    }
    if (category === CLASSIC_CATEGORY) {
      if (!classic_placed) {
        out.push(CLASSIC_CATEGORY);
        classic_placed = true;
      }
      continue;
    }
    out.push(category);
  }
  if (!warm_placed) out.unshift(WARM_DRINKS_CATEGORY);
  if (!classic_placed) {
    const warm_i = out.indexOf(WARM_DRINKS_CATEGORY);
    out.splice(warm_i + 1, 0, CLASSIC_CATEGORY);
  }
  return out;
}

/** старые слитые категории → «тёплые напитки»; выбранные в админке категории не трогаем */
function fold_legacy_categories(item: menu_item): menu_item {
  const cats = item_categories(item);
  if (!cats.some((c) => folded_warm_categories.has(c))) return item;
  const fold = (c: string) => (folded_warm_categories.has(c) ? WARM_DRINKS_CATEGORY : c);
  return set_item_categories({ ...item, category: fold(item.category) }, cats.map(fold));
}

const local = (name: string) => `/images/menu/${name}.png`;

function vols(base: number, large: number) {
  return [
    { ml: 500, add: 0 },
    { ml: 650, add: Math.max(0, large - base) },
  ];
}

function item(
  id: string,
  name: string,
  price: number,
  category: string,
  image_url: string,
  extras?: Partial<menu_item> & {
    badge?: { text: string; color?: menu_badge_color };
    recommendations?: string[];
  }
): menu_item {
  const { badge, recommendations = [], ...rest } = extras ?? {};
  const is_combo = category === 'комбо';
  return {
    id,
    name,
    price,
    category,
    image_url,
    is_available: true,
    recommendations,
    prep_minutes: DEFAULT_PREP_MINUTES,
    volumes: is_combo ? [] : vols(price, price + 50),
    has_toppings: is_combo ? false : true,
    cold: is_combo ? false : true,
    hot: false,
    ...(badge ? { badge_text: badge.text, badge_color: 'orange' as const } : {}),
    ...rest,
  };
}

export const default_menu_items: menu_item[] = [
  item('original-black', 'чёрный сахар', 390, WARM_DRINKS_CATEGORY, `${local('original-black')}?v=12`, {
    composition: 'чёрный чай, молоко, тапиока, сироп «чёрный сахар»',
    volumes: vols(390, 450),
    cold: false,
    hot: true,
    recommendations: ['original-black-led', 'jasmine-green'],
  }),
  item('jasmine-green', 'зелёный жасмин', 390, WARM_DRINKS_CATEGORY, `${local('jasmine-green')}?v=12`, {
    composition: 'зелёный чай с жасмином, молоко, тапиока, сироп «чёрный сахар»',
    volumes: vols(390, 450),
    cold: false,
    hot: true,
    recommendations: ['jasmine-green-led', 'original-black'],
  }),
  item('matcha-latte-tiger', 'матча латте', 450, WARM_DRINKS_CATEGORY, `${local('matcha-latte-tiger')}?v=14`, {
    composition:
      'молоко, натуральный порошок матчи, вода, сырная шапка, тапиока, сироп «чёрный сахар»',
    volumes: vols(450, 520),
    cold: true,
    hot: true,
    recommendations: ['matcha-lichi', 'taro', 'kakao'],
  }),
  item('matcha-lichi', 'матча личи', 450, WARM_DRINKS_CATEGORY, `${local('matcha-lichi')}?v=13`, {
    composition: 'молоко, натуральный порошок матчи, вода, желе «личи»',
    volumes: vols(450, 520),
    cold: false,
    hot: true,
    recommendations: ['matcha-latte-tiger', 'taro', 'cherny-karamel'],
  }),
  item('cherny-karamel', 'карамельный чёрный чай', 390, WARM_DRINKS_CATEGORY, `${local('cherny-karamel')}?v=12`, {
    composition: 'чёрный чай, молоко, тапиока, сироп «карамельный», топинг «карамель»',
    volumes: vols(390, 450),
    cold: true,
    hot: true,
    recommendations: ['vanilny-milktea', 'original-black-led'],
  }),
  item('taro', 'таро', 450, WARM_DRINKS_CATEGORY, `${local('taro')}?v=20`, {
    composition: 'пюре «таро», молоко, сироп, краситель, сырная шапка, тапиока',
    volumes: vols(450, 520),
    cold: true,
    hot: true,
    recommendations: ['matcha-latte-tiger', 'kakao'],
  }),
  item('taro-legacy', 'таро (старый рецепт)', 450, WARM_DRINKS_CATEGORY, `${local('taro')}?v=20`, {
    composition: 'сухая смесь «таро», молоко, тапиока, лёд',
    volumes: vols(450, 520),
    cold: true,
    hot: true,
    archived: true,
    is_available: false,
    recommendations: [],
  }),
  item('kakao', 'какао', 420, WARM_DRINKS_CATEGORY, `${local('kakao')}?v=12`, {
    composition: 'молоко, какао-порошок, сироп «шоколадный», сырная пенка',
    volumes: vols(420, 480),
    cold: true,
    hot: true,
    nutrition: { kcal: 70, protein: 2.4, fat: 3, carb: 9 },
    recommendations: ['masala-chai', 'taro'],
  }),
  item('masala-chai', 'масала чай', 450, WARM_DRINKS_CATEGORY, `${local('masala-chai')}?v=26`, {
    composition:
      'чёрный чай, сахар тростниковый, специи (имбирь, перец чёрный, кардамон), сливки, сырная шапка, тапиока',
    volumes: vols(450, 520),
    cold: false,
    hot: false,
    recommendations: ['kakao', 'original-black-led'],
  }),
  item('medovy-tykvenny-latte', 'медовый тыквенный латте', 450, WARM_DRINKS_CATEGORY, `${local('medovy-tykvenny-latte')}?v=5`, {
    composition: 'тыквенное пюре, молоко, сироп, краситель, сырная шапка, тапиока',
    volumes: vols(450, 520),
    cold: false,
    hot: true,
    recommendations: ['masala-chai', 'taro'],
  }),
  item('original-black-led', 'чёрный сахар', 390, CLASSIC_CATEGORY, `${local('original-black-led')}?v=25`, {
    composition: 'чёрный чай, молоко, тапиока, сироп «чёрный сахар», лёд',
    volumes: vols(390, 450),
    cold: true,
    hot: false,
    recommendations: ['jasmine-green-led', 'vanilny-milktea', 'cherny-karamel-led'],
  }),
  item('jasmine-green-led', 'зелёный жасмин', 390, CLASSIC_CATEGORY, `${local('jasmine-green-led')}?v=31`, {
    composition: 'зелёный чай с жасмином, молоко, тапиока, сироп «чёрный сахар», лёд',
    volumes: vols(390, 450),
    cold: true,
    hot: false,
    recommendations: ['original-black-led', 'vanilny-milktea'],
  }),
  item('cherny-karamel-led', 'карамельный чёрный чай', 390, CLASSIC_CATEGORY, `${local('cherny-karamel')}?v=12`, {
    composition: 'чёрный чай, молоко, тапиока, сироп «карамельный», топинг «карамель», лёд',
    volumes: vols(390, 450),
    cold: true,
    hot: false,
    recommendations: ['vanilny-milktea', 'original-black-led', 'cherny-karamel'],
  }),
  item('klubnichny-limonad', 'клубничный лимонад', 319, 'лимонады', local('klubnichny-limonad'), {
    is_available: false,
    composition: 'газированная вода, концентрат клубники, джус-боллы с соком клубники, лёд',
    volumes: vols(319, 390),
    cold: true,
    hot: false,
    recommendations: ['tropichesky-limonad'],
  }),
  item('ananas-marakuya', 'ананас маракуйя', 319, 'лимонады', `${local('ananas-marakuya')}?v=3`, {
    composition: 'газированная вода, концентрат ананаса, джус-боллы с соком маракуйи, лёд',
    volumes: vols(319, 390),
    cold: true,
    hot: false,
  }),
  item('tropichesky-limonad', 'тропический фьюжн', 299, 'лимонады', local('tropichesky-limonad'), {
    composition:
      'газированная вода, сироп «блю кюрасао», джус-боллы с соком маракуйи, желе «личи», лёд',
    volumes: vols(299, 410),
    cold: true,
    hot: false,
    is_available: false,
    recommendations: ['klubnichny-limonad'],
  }),
  item('klubnika-mango', 'клубника манго', 390, 'на фруктовом пюре', `${local('klubnika-mango')}?v=15`, {
    composition: 'клубника, вода, тростниковый сахар, молоко, джус-боллы с соком манго, лёд',
    volumes: vols(390, 470),
    cold: true,
    hot: false,
    recommendations: ['mango-marakuya'],
  }),
  item('mango-marakuya', 'манго маракуйя', 390, 'на фруктовом пюре', `${local('mango-marakuya')}?v=1`, {
    composition: 'манго, вода, тростниковый сахар, молоко, джус-боллы с соком маракуйи, лёд',
    volumes: vols(390, 470),
    cold: true,
    hot: false,
    recommendations: ['klubnika-mango'],
  }),
  item('nezhnaya-roza', 'нежная роза', 420, 'молочные', local('nezhnaya-roza'), {
    is_available: false,
    composition: 'молоко, концентрат клубники, джус-боллы с соком клубники, розовая вода, лёд',
    volumes: vols(420, 480),
    cold: true,
    hot: false,
    recommendations: ['malinovy-yogurt', 'tropichesky-mango'],
  }),
  item('malinovy-yogurt', 'малиновый йогурт', 420, 'молочные', `${local('malinovy-yogurt')}?v=13`, {
    composition: 'молоко, сироп «малина», сгущённое молоко, джус-боллы йогурт, лёд',
    volumes: vols(420, 480),
    cold: true,
    hot: false,
    nutrition: { kcal: 54, protein: 1.6, fat: 1.4, carb: 9 },
    recommendations: ['vanilny-milktea', 'tropichesky-mango'],
  }),
  item('vanilny-milktea', 'ванильный милкти', 390, 'молочные', `${local('vanilny-milktea')}?v=21`, {
    composition: 'молоко, сироп «ванильный», тапиока, сироп «чёрный сахар», лёд',
    volumes: vols(390, 450),
    cold: true,
    hot: false,
    recommendations: ['malinovy-yogurt', 'tropichesky-mango'],
  }),
  item('tropichesky-mango', 'тропический манго', 420, 'молочные', `${local('tropichesky-mango')}?v=12`, {
    composition:
      'молоко, сироп «кокос карамельный», джус-боллы манго и маракуйя, желе «личи», лёд',
    volumes: vols(420, 480),
    cold: true,
    hot: false,
    nutrition: { kcal: 57, protein: 1.6, fat: 1.4, carb: 9.6 },
    recommendations: ['malinovy-yogurt', 'nezhnaya-roza'],
  }),
  item('subzero', 'сабзиро', 490, 'напиток месяца', local('subzero'), {
    composition:
      'газированная вода, джус-боллы йогурт, сироп «блю кюрасао», много льда, снег, экстракт ментола',
    volumes: [{ ml: 650, add: 0 }],
    cold: true,
    hot: false,
    is_available: false,
    recommendations: [],
    badge: { text: 'месяца' },
  }),
  item('combo-dabl-drop', 'двойной', 719, 'комбо', local('combo-dabl-drop'), {
    composition: '2 напитка 500 мл на выбор',
    combo: { drink_count: 2, volume_ml: 500, allow_duplicates: true },
    recommendations: ['combo-semeiny', 'combo-druzhba'],
  }),
  item('combo-semeiny', 'семейный', 1050, 'комбо', local('combo-semeiny'), {
    composition: '3 напитка 500 мл на выбор',
    combo: { drink_count: 3, volume_ml: 500, allow_duplicates: true },
    recommendations: ['combo-dabl-drop', 'combo-druzhba'],
  }),
  item('combo-druzhba', 'дружба', 1990, 'комбо', local('combo-druzhba'), {
    composition: '6 напитков 500 мл на выбор',
    combo: { drink_count: 6, volume_ml: 500, allow_duplicates: true },
    recommendations: ['combo-dabl-drop', 'combo-semeiny'],
  }),
];

const placeholder_pool = default_menu_items
  .map((i) => i.image_url)
  .filter((url): url is string => Boolean(url));

function placeholder_for_id(id: string) {
  if (!placeholder_pool.length) return local('original-black');
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % placeholder_pool.length;
  return placeholder_pool[hash] ?? local('original-black');
}

function normalize_item_name(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function find_default_item(item: menu_item, by_id: Map<string, menu_item>, by_name: Map<string, menu_item>) {
  return by_id.get(item.id) ?? by_name.get(normalize_item_name(item.name));
}

const known_menu_bases = new Set(
  default_menu_items.map((i) => {
    const url = (i.image_url || '').trim();
    if (!url.startsWith('/images/menu/')) return '';
    return url.slice('/images/menu/'.length).replace(/\.[^.]+$/, '').replace(/\?.*$/, '');
  }).filter(Boolean)
);

function is_stale_menu_placeholder(url: string) {
  if (!url.startsWith('/images/menu/')) return false;
  if (url.endsWith('.svg')) return true;
  const base = url
    .slice('/images/menu/'.length)
    .replace(/\?.*$/, '')
    .replace(/\.[^.]+$/, '');
  return !known_menu_bases.has(base);
}

function resolve_image_url(item: menu_item, fallback?: menu_item): string {
  const url = (item.image_url || '').trim();

  // кастомное фото из админки (data/blob)
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // актуальный локальный PNG; ?v= на дефолте сбрасывает кэш старого файла.
  // своё фото новой позиции не из дефолтного списка тоже оставляем.
  if (url.startsWith('/images/menu/') && !url.endsWith('.svg')) {
    const known = !is_stale_menu_placeholder(url);
    if (known && fallback?.image_url) {
      const strip = (value: string) => value.split('?')[0];
      if (strip(url) === strip(fallback.image_url) && fallback.image_url.includes('?')) {
        return fallback.image_url;
      }
    }
    if (known || !fallback?.image_url) return url;
  }

  // дефолт по id/названию — надёжнее битых https из БД
  if (fallback?.image_url) {
    return fallback.image_url;
  }

  // внешний url, если дефолта нет (уникальные позиции)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return placeholder_for_id(item.id);
}

/** запасной url, если основной http/cdn упал */
export function resolve_menu_item_fallback_image_url(item: menu_item): string | null {
  const { by_id, by_name } = get_default_lookups();
  const fallback = find_default_item(item, by_id, by_name);
  if (fallback?.image_url) return fallback.image_url;
  const ph = placeholder_for_id(item.id);
  return ph || null;
}

let default_lookups: {
  by_id: Map<string, menu_item>;
  by_name: Map<string, menu_item>;
} | null = null;

function get_default_lookups() {
  if (!default_lookups) {
    default_lookups = {
      by_id: new Map(default_menu_items.map((i) => [i.id, i])),
      by_name: new Map(default_menu_items.map((i) => [normalize_item_name(i.name), i])),
    };
  }
  return default_lookups;
}

/** единая точка: всегда отдаёт рабочий url картинки для карточки */
export function resolve_menu_item_image_url(item: menu_item): string {
  const { by_id, by_name } = get_default_lookups();
  const fallback = find_default_item(item, by_id, by_name);
  return resolve_image_url(item, fallback);
}

export type menu_store = {
  version: number;
  categories: string[];
  items: menu_item[];
  removed_item_ids?: string[];
  /** soft = Nunito, playful = Caveat */
  category_heading_styles?: Record<string, heading_style>;
};

const storage_key = 'yoboba_menu_store';
const update_event = 'yoboba-menu-update';

let published_heading_styles: Record<string, heading_style> | null = null;
let publish_timer: number | undefined;

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

export function apply_published_heading_styles(
  styles?: Record<string, heading_style> | null
) {
  published_heading_styles = styles ?? null;
}

/** что изменили на этом устройстве и ещё не доставили на сервер */
const dirty_ids = new Set<string>();
let dirty_full = false;
let publish_retry = 0;

function mark_dirty(ids?: string[]) {
  if (!ids) dirty_full = true;
  else for (const id of ids) dirty_ids.add(id);
}

function has_dirty() {
  return dirty_full || dirty_ids.size > 0;
}

/**
 * Отправляет только свои изменения. Целиком меню уходит лишь после правки категорий —
 * иначе старая копия меню на другом устройстве откатывала бы чужие правки.
 */
export function publish_menu_now(store: menu_store = get_menu_store()) {
  if (typeof window === 'undefined' || !has_dirty()) return;
  const full = dirty_full;
  const ids = [...dirty_ids];
  dirty_full = false;
  dirty_ids.clear();
  const items = full ? store.items : store.items.filter((item) => ids.includes(item.id));
  if (!items.length) return;
  const body = JSON.stringify({ ...store, version: store_version, items, partial: !full });
  const requeue = () => {
    mark_dirty(full ? undefined : ids);
    publish_retry = Math.min(publish_retry + 1, 5);
    window.clearTimeout(publish_timer);
    publish_timer = window.setTimeout(() => publish_menu_now(), 1500 * 2 ** publish_retry);
  };
  void fetch('/api/admin/menu', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body,
    // доживает до сервера, даже если вкладку закрыли или перезагрузили
    keepalive: body.length < 60_000,
  })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      publish_retry = 0;
    })
    .catch(requeue);
}

function schedule_publish() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(publish_timer);
  publish_timer = window.setTimeout(() => publish_menu_now(), 400);
}

/** сразу отправить текущее меню и снять отложенную запись, чтобы она не затёрла более новый снимок */
export function settle_menu_publish() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(publish_timer);
  publish_menu_now();
}

if (typeof window !== 'undefined') {
  const flush_on_leave = () => {
    if (document.visibilityState === 'hidden' && has_dirty()) settle_menu_publish();
  };
  window.addEventListener('pagehide', () => {
    if (has_dirty()) settle_menu_publish();
  });
  document.addEventListener('visibilitychange', flush_on_leave);
}

function merge_default_badges(items: menu_item[]) {
  const default_by_id = new Map(default_menu_items.map((i) => [i.id, i]));
  const default_by_name = new Map(default_menu_items.map((i) => [i.name.trim().toLowerCase(), i]));

  return items.map((item) => {
    const fallback =
      default_by_id.get(item.id) ?? default_by_name.get(item.name.trim().toLowerCase());

    if (item.badge_text?.trim()) {
      return { ...item, badge_color: 'orange' as menu_badge_color };
    }

    // undefined/null → подтянуть дефолт; '' → пользователь выключил плашку
    if (item.badge_text !== undefined && item.badge_text !== null) {
      return item;
    }

    if (fallback?.badge_text?.trim()) {
      return {
        ...item,
        badge_text: fallback.badge_text,
        badge_color: 'orange' as menu_badge_color,
      };
    }
    return item;
  });
}

export function apply_menu_item_badges(items: menu_item[]) {
  return merge_default_badges(items);
}

/** чинит старые SVG / рандомные png из БД — матч по id или по названию */
export function normalize_menu_item_images(items: menu_item[]) {
  return merge_menu_item_catalog(items).map((item) => ({
    ...item,
    image_url: resolve_image_url(
      item,
      find_default_item(item, get_default_lookups().by_id, get_default_lookups().by_name)
    ),
  }));
}

/** цены, объёмы и флаги карточки — из актуального меню в коде */
export function merge_menu_item_catalog(items: menu_item[], removed_ids: Iterable<string> = []): menu_item[] {
  const removed = new Set([...removed_ids, ...dropped_menu_item_ids]);
  const { by_id, by_name } = get_default_lookups();
  const merged = items.filter((item) => !removed.has(item.id) && !dropped_menu_item_ids.has(item.id)).map((raw) => {
    const fallback = find_default_item(raw, by_id, by_name);
    if (!fallback) return raw;
    const item = fold_legacy_categories(raw);
    return {
      ...item,
      price: fallback.price,
      volumes: fallback.volumes,
      has_toppings: fallback.has_toppings,
      cold: typeof item.cold === 'boolean' ? item.cold : fallback.cold,
      hot: typeof item.hot === 'boolean' ? item.hot : fallback.hot,
      composition:
        item.id === 'taro' || item.id === 'medovy-tykvenny-latte'
          ? fallback.composition
          : (item.composition ?? fallback.composition),
      nutrition: item.nutrition ?? fallback.nutrition,
      combo: item.combo ?? fallback.combo,
    };
  });
  const ids = new Set(merged.map((item) => item.id));
  for (const def of default_menu_items) {
    if (
      !ids.has(def.id) &&
      !iced_only_ids.has(def.id) &&
      !dual_temp_led_ids.has(def.id) &&
      !removed.has(def.id)
    ) {
      merged.push({ ...def });
    }
  }
  return merged
    .filter(
      (item) =>
        !iced_only_ids.has(item.id) && !dual_temp_led_ids.has(item.id) && !removed.has(item.id)
    )
    .map((item) => {
      const classic_snapshot = classic_snapshot_urls[item.id];
      const iced =
        item.id === 'original-black-led'
          ? { name: 'чёрный сахар', cold: true as const, hot: false as const, image_url: classic_snapshot }
          : item.id === 'jasmine-green-led'
            ? {
                name: 'зелёный жасмин',
                cold: true as const,
                hot: false as const,
                image_url: classic_snapshot,
              }
            : null;
      const recommendations = (item.recommendations ?? [])
        .map((id) => dual_temp_led_to_base[id] ?? id)
        .filter((id) => !retired_item_ids.has(id) && !dual_temp_led_ids.has(id));
      // снятые позиции уходят в архив один раз; вернуть из архива админ может сам
      const retire = is_retired_menu_item(item) && typeof item.archived !== 'boolean';
      return {
        ...item,
        ...iced,
        is_available: retire ? false : item.is_available,
        archived: retire ? true : item.archived,
        image_url: freshen_menu_photo(iced?.image_url || item.image_url),
        recommendations: [...new Set(recommendations)],
      };
    });
}

function freshen_menu_photo(url: string | null | undefined): string | null {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url || null;
  const path = url.split('?')[0];
  const versions: Record<string, string> = {
    '/images/menu/original-black.png': '12',
    '/images/menu/matcha-latte-tiger.png': '14',
    '/images/menu/matcha-lichi.png': '13',
    '/images/menu/taro.png': '20',
    '/images/menu/masala-chai.png': '26',
    '/images/menu/medovy-tykvenny-latte.png': '5',
    '/images/menu/kakao.png': '12',
    '/images/menu/original-black-led.png': '25',
    '/images/menu/jasmine-green-led.png': '31',
    '/images/menu/jasmine-green.png': '12',
    '/images/menu/cherny-karamel.png': '12',
    '/images/menu/ananas-marakuya.png': '3',
    '/images/menu/klubnika-mango.png': '15',
    '/images/menu/mango-marakuya.png': '1',
    '/images/menu/malinovy-yogurt.png': '13',
    '/images/menu/vanilny-milktea.png': '21',
    '/images/menu/tropichesky-mango.png': '12',
    '/images/menu/glintvein.png': '27',
  };
  const version = versions[path];
  if (!version) return url;
  return `${path}?v=${version}`;
}

const classic_snapshot_urls: Record<string, string> = {
  'original-black-led': `${local('original-black-led')}?v=25`,
  'jasmine-green-led': `${local('jasmine-green-led')}?v=31`,
};

function repair_menu_store(store: menu_store): menu_store {
  const defaults = get_default_store();
  const removed = new Set(store.removed_item_ids ?? []);
  const categories = fold_warm_drink_categories(
    store.categories?.length > 0 ? store.categories : defaults.categories
  );
  const default_by_id = new Map(defaults.items.map((i) => [i.id, i]));
  const default_by_name = new Map(
    defaults.items.map((i) => [normalize_item_name(i.name), i])
  );
  const existing_ids = new Set((store.items ?? []).map((i) => i.id));
  const items = merge_default_badges(
    merge_menu_item_catalog(
      (store.items ?? []).map((raw) => {
        const fallback = find_default_item(raw, default_by_id, default_by_name);
        const item = fold_legacy_categories(raw);
        const known_cats = item_categories(item).filter((c) => categories.includes(c));
        const category = known_cats[0] ?? fallback?.category ?? categories[0];
        const image_url = resolve_image_url(item, fallback);
        const prep_minutes =
          typeof item.prep_minutes === 'number' && item.prep_minutes > 0
            ? item.prep_minutes
            : fallback?.prep_minutes ?? DEFAULT_PREP_MINUTES;
        return {
          ...item,
          category,
          categories: known_cats.length ? known_cats : [category],
          image_url,
          prep_minutes,
        };
      }),
      removed
    )
  );
  for (const def of defaults.items) {
    if (!existing_ids.has(def.id) && !removed.has(def.id)) {
      items.push({
        ...def,
        is_available: is_retired_menu_item(def) ? false : def.is_available,
        image_url: resolve_image_url(def, def),
      });
    }
  }
  const repaired = {
    version: store_version,
    categories,
    items,
    removed_item_ids: store.removed_item_ids ?? [],
    category_heading_styles: {
      ...default_category_heading_styles,
      ...(store.category_heading_styles ?? {}),
    },
  };
  if (JSON.stringify(repaired) !== JSON.stringify(store)) {
    localStorage.setItem(storage_key, JSON.stringify(repaired));
  }
  return repaired;
}

export function get_default_store(): menu_store {
  return {
    version: store_version,
    categories: [...default_categories],
    items: default_menu_items.map((i) => ({ ...i })),
    removed_item_ids: [],
    category_heading_styles: { ...default_category_heading_styles },
  };
}

/**
 * bump store_version: подтянуть дефолты, но не выкидывать кастомные позиции.
 * пустой/битый снимок → только дефолтное меню.
 */
export function upgrade_menu_store(stored: menu_store | null | undefined): menu_store {
  if (!stored?.items?.length) return get_default_store();
  const defaults = get_default_store();
  // удалённое админом не воскрешаем из каталога по умолчанию
  const removed_item_ids = [...new Set([...(stored.removed_item_ids ?? []), ...dropped_menu_item_ids])];
  return {
    version: store_version,
    categories: fold_warm_drink_categories(
      stored.categories?.length ? stored.categories : defaults.categories
    ),
    items: merge_menu_item_catalog(stored.items, removed_item_ids),
    removed_item_ids,
    category_heading_styles: {
      ...default_category_heading_styles,
      ...(stored.category_heading_styles ?? {}),
    },
  };
}

export function get_menu_store(): menu_store {
  if (typeof window === 'undefined') return get_default_store();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as menu_store;
    if (!parsed.version || parsed.version < store_version) {
      const upgraded = upgrade_menu_store(parsed);
      localStorage.setItem(storage_key, JSON.stringify(upgraded));
      return upgraded;
    }
    return repair_menu_store(parsed);
  } catch {
    const seed = get_default_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

/** changed — id изменённых позиций; без него на сервер уйдёт всё меню (правка категорий) */
export function save_menu_store(store: menu_store, changed?: string[]) {
  const next = { ...store, version: store_version };
  localStorage.setItem(storage_key, JSON.stringify(next));
  mark_dirty(changed);
  emit_update();
  schedule_publish();
}

/** применить меню с сервера на всех устройствах (без повторной публикации) */
export function apply_published_menu_store(store: menu_store) {
  if (typeof window === 'undefined') return null;
  if (!store?.items?.length) return null;
  // свои ещё не доставленные правки сервер пока не знает — не затираем их его снимком
  if (dirty_full) return get_menu_store();
  const local = dirty_ids.size ? new Map(get_menu_store().items.map((item) => [item.id, item])) : null;
  const items = local
    ? [
        ...store.items.map((item) => (dirty_ids.has(item.id) ? local.get(item.id) ?? item : item)),
        ...[...dirty_ids].flatMap((id) => {
          const own = local.get(id);
          return own && !store.items.some((item) => item.id === id) ? [own] : [];
        }),
      ]
    : store.items;
  const repaired = repair_menu_store({
    ...store,
    items,
    version: store_version,
  });
  localStorage.setItem(storage_key, JSON.stringify(repaired));
  apply_published_heading_styles(repaired.category_heading_styles);
  emit_update();
  return repaired;
}

export function reset_menu_store() {
  save_menu_store(get_default_store());
}

export function subscribe_menu_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function add_category(name: string) {
  const store = get_menu_store();
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || store.categories.includes(trimmed)) return;
  store.categories.push(trimmed);
  save_menu_store(store);
}

export function rename_category(old_name: string, new_name: string) {
  const store = get_menu_store();
  const trimmed = new_name.trim().toLowerCase();
  if (!trimmed || trimmed === old_name) return;
  store.categories = store.categories.map((c) => (c === old_name ? trimmed : c));
  store.items = store.items.map((i) => rename_item_category(i, old_name, trimmed));
  const styles = { ...(store.category_heading_styles ?? {}) };
  const prev_style =
    styles[old_name] ?? default_category_heading_styles[old_name] ?? undefined;
  if (prev_style) {
    styles[trimmed] = prev_style;
    delete styles[old_name];
    store.category_heading_styles = styles;
  }
  save_menu_store(store);
}

export function delete_category(name: string) {
  const store = get_menu_store();
  store.categories = store.categories.filter((c) => c !== name);
  store.items = store.items.flatMap((i) => {
    const next = drop_item_category(i, name);
    return next ? [next] : [];
  });
  if (store.category_heading_styles?.[name]) {
    const styles = { ...store.category_heading_styles };
    delete styles[name];
    store.category_heading_styles = styles;
  }
  save_menu_store(store);
}

export function set_category_heading_style(category: string, style: heading_style) {
  const store = get_menu_store();
  store.category_heading_styles = {
    ...(store.category_heading_styles ?? {}),
    [category]: style,
  };
  save_menu_store(store);
}

export function get_category_heading_style(category: string): heading_style {
  if (published_heading_styles?.[category]) return published_heading_styles[category];
  const store = typeof window === 'undefined' ? get_default_store() : get_menu_store();
  return (
    store.category_heading_styles?.[category] ??
    default_category_heading_styles[category] ??
    'soft'
  );
}

export function move_category(name: string, dir: -1 | 1) {
  const store = get_menu_store();
  const idx = store.categories.indexOf(name);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= store.categories.length) return;
  const cats = [...store.categories];
  [cats[idx], cats[next]] = [cats[next], cats[idx]];
  store.categories = cats;
  save_menu_store(store);
}

export function upsert_menu_item(data: menu_item) {
  const store = get_menu_store();
  const next = set_item_categories(data, item_categories(data));
  const idx = store.items.findIndex((i) => i.id === next.id);
  if (idx >= 0) store.items[idx] = next;
  else store.items.push(next);
  for (const cat of item_categories(next)) {
    if (!store.categories.includes(cat)) store.categories.push(cat);
  }
  save_menu_store(store, [next.id]);
}

export function delete_menu_item(id: string) {
  const store = get_menu_store();
  // Не удаляем карточку физически: фото, состав и история должны остаться в админке.
  // Для сайта позиция исчезает благодаря is_available=false.
  store.items = store.items.map((item) =>
    item.id === id ? { ...item, is_available: false } : item
  );
  const removed = new Set(store.removed_item_ids ?? []);
  removed.add(id);
  store.removed_item_ids = [...removed];
  save_menu_store(store, [id]);
}

export function new_item_id() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
