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
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: auth, error: auth_error } = await supabase.auth.signInAnonymously();
console.log('anon auth', { user: auth.user?.id, error: auth_error?.message });

if (!auth.user) process.exit(1);

const uid = auth.user.id;

const { data: profile, error: profile_error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', uid)
  .maybeSingle();
console.log('profile', { profile, error: profile_error?.message });

const { data: menu } = await supabase.from('menu').select('id, name').limit(1).single();
console.log('menu sample', menu);

if (menu) {
  const { data: cart, error: cart_error } = await supabase.from('cart_items').upsert(
    {
      user_id: uid,
      menu_id: menu.id,
      quantity: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,menu_id' }
  );
  console.log('cart upsert', { cart, error: cart_error?.message, details: cart_error?.details, hint: cart_error?.hint, code: cart_error?.code });
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: admin_profile } = await admin.from('profiles').select('*').eq('id', uid).maybeSingle();
console.log('admin profile check', admin_profile);
