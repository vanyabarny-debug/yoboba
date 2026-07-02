import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, profile: null });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, phone, name, bonus_balance, role')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    user: {
      id: user.id,
      is_anonymous: user.is_anonymous === true,
    },
    profile: profile || null,
  });
}
