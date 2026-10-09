import type { promo_title_layout } from '@/lib/promo-title-layout';
import type { promo_image_vignette } from '@/lib/promo-image-vignette';
import type { seller_access } from '@/lib/seller-access';

export type store_spot = {
  id: string;
  city: string;
  address: string;
  label?: string;
  is_active: boolean;
};

export type sidebar_ad_slide = {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  link_url?: string;
  menu_id?: string | null;
  category?: string | null;
  is_active: boolean;
};

export type promo_banner = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  image_url: string;
  link_url?: string;
  menu_id?: string | null;
  category?: string | null;
  /** подпись кнопки перехода в сторис (по умолчанию «перейти») */
  cta_label?: string;
  /** текст уже на картинке — не дублировать в карточке/сторис */
  title_in_image?: boolean;
  /** позиция и стиль заголовка на кадре (если title_in_image = false) */
  title_layout?: promo_title_layout;
  /** затемнение сверху или снизу кадра */
  image_vignette?: promo_image_vignette | null;
  is_active: boolean;
};

export type menu_badge_color = 'pink' | 'accent' | 'orange' | 'green' | 'purple' | 'dark';

export type menu_volume = {
  ml: number;
  /** доплата к базовой цене */
  add: number;
};

export type menu_nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
};

/** что входит в комбо и как гость его собирает */
export type menu_combo_include = {
  menu_id: string;
  qty: number;
};

export type menu_combo = {
  /** сколько напитков выбирает гость */
  drink_count: number;
  /** объём каждого напитка, мл */
  volume_ml: number;
  /** можно брать один и тот же напиток несколько раз */
  allow_duplicates?: boolean;
  /** из каких разделов выбирать; пусто — все напитки */
  from_categories?: string[];
  /** фиксированные позиции в комплекте (закуски и т.п.) */
  includes?: menu_combo_include[];
};

export type menu_item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  /** основная категория (для топпингов, кбжу, бобаллов) */
  category: string;
  /** все разделы, где показывать позицию; если пусто — только category */
  categories?: string[];
  is_available: boolean;
  /** в архиве админки — не в основном списке меню */
  archived?: boolean;
  recommendations: string[];
  prep_minutes?: number;
  badge_text?: string;
  badge_color?: menu_badge_color;
  /** @deprecated размеры в карточке берутся из volumes / техкарты */
  has_volumes?: boolean;
  /** порции топпинга в карточке; по умолчанию да, кроме закусок */
  has_toppings?: boolean;
  /** варианты объёма (= размеры техкарты); пусто — без выбора мл */
  volumes?: menu_volume[];
  /** состав через запятую; иначе берётся из категории */
  composition?: string;
  /** кбжу: на 100 мл, если есть объёмы, иначе на порцию */
  nutrition?: menu_nutrition;
  /** можно холодно */
  cold?: boolean;
  /** можно горячо */
  hot?: boolean;
  /** лимитированная позиция — показывать остаток */
  stock_limited?: boolean;
  /** сколько порций осталось (если stock_limited) */
  stock_qty?: number | null;
  /** сборка комбо: сколько напитков, объём, из каких разделов, что ещё в комплекте */
  combo?: menu_combo;
};

export type story = {
  id: string;
  image_url: string;
  title: string;
  menu_id: string | null;
  active_until: string;
};

/** выбранные позиции внутри комбо — для склада и отображения */
export type order_combo_component = {
  menu_id: string;
  name: string;
  volume?: string;
  quantity?: number;
};

export type order_item = {
  menu_id: string;
  name: string;
  price: number;
  quantity: number;
  /** объём в мл — чтобы склад списал нужный размер техкарты */
  volume?: string;
  /** выбранная температура: холодный или горячий */
  temp?: 'cold' | 'hot';
  /** напиток персонала — расход сырья, без выручки */
  kind?: 'sale' | 'staff';
  /** названия выбранных напитков в комбо (для чека/гостя) */
  combo_picks?: string[];
  /** разложение комбо на позиции для склада и себестоимости */
  combo_components?: order_combo_component[];
};

export type gift_status =
  | 'pending_payment'
  | 'paid'
  | 'claimed'
  | 'redeemed'
  | 'cancelled';

/** оплаченный онлайн подарок: напиток ждёт получателя по телефону */
export type gift = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_phone: string | null;
  recipient_phone: string;
  recipient_user_id: string | null;
  items: order_item[];
  total_price: number;
  message: string | null;
  status: gift_status;
  payment_id: string | null;
  payment_provider: 'stub' | 'kassa';
  checkout_url: string | null;
  order_id: string | null;
  created_at: string;
  paid_at: string | null;
  claimed_at: string | null;
  expires_at: string | null;
};

export type order = {
  id: string;
  user_id: string;
  items: order_item[];
  total_price: number;
  status: 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  payment_type: 'cash' | 'card' | 'online' | 'bonus';
  /** false / undefined = ещё не оплачен */
  is_paid?: boolean;
  customer_name?: string | null;
  customer_phone?: string | null;
  pickup_time: string;
  created_at: string;
  /** порядковый номер за день: 1, 2, 3… */
  order_number?: number | null;
  /** дата смены нумерации (МСК) */
  order_day?: string | null;
  /** точка продажи (смена кассы / самовывоз) */
  spot_id?: string | null;
};

export type seller = {
  id: string;
  login: string;
  password: string;
  name: string;
  /** должность своими словами: бариста, менеджер, кассир */
  role_title?: string;
  /** какие вкладки кассы ему открыты */
  access?: Partial<seller_access>;
  is_active: boolean;
  created_at: string;
  /** точки, на которых сотрудник может открыть смену */
  spot_ids?: string[];
  /** оклад «на руки» в месяц, ₽ — база для ФОТ */
  salary_net?: number;
  /** платить ли НДФЛ с этой ЗП (по умолчанию да, если salary_net > 0) */
  with_ndfl?: boolean;
};

export type cash_transaction = {
  id: string;
  order_id: string | null;
  seller_id: string;
  seller_name: string;
  order_total: number;
  payment_method: 'cash' | 'card' | 'bonus';
  amount_received: number | null;
  change_given: number | null;
  items_summary: string;
  shift_date: string;
  created_at: string;
  /** точка смены */
  spot_id?: string | null;
  spot_address?: string | null;
  /** id серверной смены */
  shift_id?: string | null;
};

export type day_summary = {
  shift_date: string;
  cash_total: number;
  card_total: number;
  grand_total: number;
  transaction_count: number;
  cash_received: number;
  cash_change: number;
};

/** гео при открытии смены (GPS устройства кассы) */
export type shift_open_geo = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  /** адрес/город по reverse geocode, если удалось */
  label: string | null;
  status: 'ok' | 'denied' | 'unavailable' | 'timeout' | 'error';
};

/** участник смены на точке */
export type shift_crew_member = {
  seller_id: string;
  seller_name: string;
  joined_at: string;
};

/** открытая / закрытая смена на точке (одна на день) */
export type seller_shift_record = {
  id: string;
  spot_id: string;
  spot_address: string;
  spot_city: string;
  /** кто открыл / последний активный — для совместимости */
  seller_id: string;
  seller_name: string;
  opened_at: string;
  closed_at: string | null;
  /** календарный день смены по Москве */
  shift_date: string;
  /** фактическая геолокация в момент открытия смены */
  open_geo?: shift_open_geo | null;
  /** все бариста, кто был на этой смене */
  crew?: shift_crew_member[];
};

/** одно приготовление напитка баристой */
export type prep_event = {
  id: string;
  seller_id: string;
  seller_name: string;
  order_id: string;
  drink_key: string;
  drink_name: string;
  menu_id: string;
  expected_ms: number;
  actual_ms: number;
  started_at: string;
  finished_at: string;
  pickup_at: string;
  /** скорость относительно нормы prep_minutes */
  drink_pace: 'fast' | 'normal' | 'slow';
  shift_date: string;
};

/** полная выдача заказа (от старта первого напитка до выдачи) */
export type fulfillment_event = {
  id: string;
  seller_id: string;
  seller_name: string;
  order_id: string;
  started_at: string;
  finished_at: string;
  pickup_at: string;
  duration_ms: number;
  /** успел ли к pickup_time */
  timing: 'early' | 'on_time' | 'overdue';
  shift_date: string;
};

export type drink_stat = {
  menu_id: string;
  name: string;
  count: number;
  avg_ms: number;
  fastest_ms: number;
  slowest_ms: number;
};

export type barista_analytics = {
  shift_date: string;
  seller_id: string | null;
  avg_fulfillment_ms: number | null;
  fulfillment_count: number;
  early_count: number;
  on_time_count: number;
  overdue_count: number;
  drinks: drink_stat[];
  most_cooked: drink_stat | null;
  fastest_drink: drink_stat | null;
  slowest_drink: drink_stat | null;
  prep_count: number;
  /** все смены этого кассира: заказы и топ напитков */
  history_orders: number;
  history_drinks: drink_stat[];
};

export type live_cart_row = {
  id: string;
  user_id: string;
  quantity: number;
  updated_at: string;
  menu: {
    id: string;
    name: string;
    price: number;
    category: string;
  } | null;
};
