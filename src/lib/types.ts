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

export type menu_item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
  is_available: boolean;
  recommendations: string[];
  prep_minutes?: number;
  badge_text?: string;
  badge_color?: menu_badge_color;
  /** выбор объёма в карточке; по умолчанию да, кроме закусок */
  has_volumes?: boolean;
  /** порции топпинга в карточке; по умолчанию да, кроме закусок */
  has_toppings?: boolean;
  /** варианты объёма; если пусто — 450 / 650 */
  volumes?: menu_volume[];
  /** состав через запятую; иначе берётся из категории */
  composition?: string;
  /** кбжу: на 100 мл, если есть объёмы, иначе на порцию */
  nutrition?: menu_nutrition;
};

export type story = {
  id: string;
  image_url: string;
  title: string;
  menu_id: string | null;
  active_until: string;
};

export type order_item = {
  menu_id: string;
  name: string;
  price: number;
  quantity: number;
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
};

export type seller = {
  id: string;
  login: string;
  password: string;
  name: string;
  is_active: boolean;
  created_at: string;
  /** точки, на которых кассир может открыть смену */
  spot_ids?: string[];
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

/** открытая / закрытая смена кассира на точке */
export type seller_shift_record = {
  id: string;
  spot_id: string;
  spot_address: string;
  spot_city: string;
  seller_id: string;
  seller_name: string;
  opened_at: string;
  closed_at: string | null;
  /** календарный день смены по Москве */
  shift_date: string;
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
