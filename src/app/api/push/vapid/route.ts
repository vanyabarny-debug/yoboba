import { NextResponse } from 'next/server';
import { get_vapid_keys } from '@/lib/vapid';

/** публичный VAPID — нужен клиенту для PushManager.subscribe */
export async function GET() {
  try {
    const keys = await get_vapid_keys();
    return NextResponse.json({
      publicKey: keys.publicKey,
      configured: true,
    });
  } catch {
    return NextResponse.json({ publicKey: null, configured: false }, { status: 500 });
  }
}
