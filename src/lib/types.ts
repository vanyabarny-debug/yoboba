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
