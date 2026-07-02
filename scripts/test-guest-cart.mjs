import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function load_env() {
  const env = {};
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = load_env();
const res = await fetch('http://localhost:3000/api/auth/guest', { method: 'POST' });
const body = await res.json();
console.log('guest api', body);

const setCookie = res.headers.getSetCookie?.() || [];
const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
console.log('cookies', cookie ? 'ok' : 'missing');

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  global: cookie ? { headers: { cookie } } : undefined,
});

// use service role to verify cart with returned user_id
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: menu } = await admin.from('menu').select('id, name').limit(1).single();
const uid = body.user_id;

const { error: cart_error } = await admin.from('cart_items').upsert({
  user_id: uid,
  menu_id: menu.id,
  quantity: 2,
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id,menu_id' });

console.log('cart insert', cart_error?.message || 'ok');

const { data: rows } = await admin.from('cart_items').select('*').eq('user_id', uid);
console.log('cart rows', rows?.length);
