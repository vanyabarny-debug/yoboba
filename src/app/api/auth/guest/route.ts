import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { create_service_client } from '@/lib/supabase/service';

function guest_email() {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@guest.yoboba.auth`;
}

async function ensure_profile(user_id: string) {
  const admin = create_service_client();
  const { data: existing } = await admin.from('profiles').select('id').eq('id', user_id).maybeSingle();
  if (existing) return;

  await admin.from('profiles').upsert(
    { id: user_id, name: 'гость', bonus_balance: 0, role: 'user' },
    { onConflict: 'id' }
  );
}

export async function POST() {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await ensure_profile(user.id);
    const { data: { session } } = await supabase.auth.getSession();
    return NextResponse.json({
      ok: true,
      user_id: user.id,
      existing: true,
      session,
    });
  }

  const admin = create_service_client();
  const email = guest_email();

  const { data: created, error: create_error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { is_guest: true, name: 'гость' },
  });

  if (create_error || !created.user) {
    return NextResponse.json(
      { error: create_error?.message || 'не удалось создать гостевую сессию' },
      { status: 500 }
    );
  }

  await ensure_profile(created.user.id);

  const { data: link, error: link_error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (link_error || !link.properties?.hashed_token) {
    return NextResponse.json(
      { error: link_error?.message || 'не удалось выдать сессию' },
      { status: 500 }
    );
  }

  const { data: verified, error: verify_error } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'email',
  });

  if (verify_error || !verified.session) {
    return NextResponse.json({ error: verify_error?.message || 'verify failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: created.user.id,
    session: verified.session,
  });
}
