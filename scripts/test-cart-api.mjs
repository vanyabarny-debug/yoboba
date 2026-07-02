import { readFileSync } from 'fs';

function load_env() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = load_env();
const base = 'http://localhost:3000';

const guest_res = await fetch(`${base}/api/auth/guest`, { method: 'POST' });
const guest = await guest_res.json();
console.log('guest', guest.ok, guest.user_id, guest.session ? 'session ok' : 'no session');

const cookie = guest_res.headers.getSetCookie?.().map((c) => c.split(';')[0]).join('; ') || '';
console.log('cookie header', cookie ? 'yes' : 'no');

const menu_res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/menu?select=id,name&limit=1`, {
  headers: {
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  },
});
const menu = (await menu_res.json())[0];
console.log('menu item', menu?.id, menu?.name);

const cart_res = await fetch(`${base}/api/cart`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    cookie,
  },
  body: JSON.stringify({ menu_id: menu.id, delta: 1 }),
});
const cart_body = await cart_res.json();
console.log('cart post', cart_res.status, cart_body);

const cart_get = await fetch(`${base}/api/cart`, {
  credentials: 'include',
  headers: { cookie },
});
const cart_items = await cart_get.json();
console.log('cart get', cart_get.status, cart_items.items?.length);
