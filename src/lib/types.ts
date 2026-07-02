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
  is_active: boolean;
};

export type menu_item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string;
  is_available: boolean;
  recommendations: string[];
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
  payment_type: 'cash' | 'card' | 'online';
  pickup_time: string;
  created_at: string;
};

export type seller = {
  id: string;
  login: string;
  password: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type cash_transaction = {
  id: string;
  order_id: string | null;
  seller_id: string;
  seller_name: string;
  order_total: number;
  payment_method: 'cash' | 'card';
  amount_received: number | null;
  change_given: number | null;
  items_summary: string;
  shift_date: string;
  created_at: string;
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
