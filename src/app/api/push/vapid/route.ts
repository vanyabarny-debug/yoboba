import { NextResponse } from 'next/server';

/** публичный VAPID — нужен клиенту для PushManager.subscribe */
export async function GET() {
  const public_key =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
  const configured = Boolean(
    public_key && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
  return NextResponse.json({
    publicKey: public_key || null,
    configured,
  });
}
