import { createBrowserClient } from '@supabase/ssr';

export type user_role = 'user' | 'barista' | 'admin';

export type profile = {
  id: string;
  phone: string | null;
  name: string | null;
  bonus_balance: number;
  role: user_role;
};

function get_client() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function sign_in_with_otp(phone: string) {
  const supabase = get_client();
  const formatted = phone.startsWith('+') ? phone : `+7${phone.replace(/\D/g, '')}`;

  const { error } = await supabase.auth.signInWithOtp({
    phone: formatted,
  });

  return { error };
}

export async function verify_otp(phone: string, token: string) {
  const supabase = get_client();
  const formatted = phone.startsWith('+') ? phone : `+7${phone.replace(/\D/g, '')}`;

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formatted,
    token,
    type: 'sms',
  });

  return { data, error };
}

export async function sign_out() {
  const supabase = get_client();
  return supabase.auth.signOut();
}

export async function get_session() {
  const supabase = get_client();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function get_profile(): Promise<profile | null> {
  const supabase = get_client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, phone, name, bonus_balance, role')
    .eq('id', user.id)
    .single();

  return data;
}
