import { NextResponse } from 'next/server';
import { get_opening_100_status } from '@/lib/opening-100-server';

/** публичный остаток бесплатных напитков для страницы акции */
export async function GET() {
  const status = await get_opening_100_status();
  return NextResponse.json({
    limit: status.limit,
    redeemed_count: status.redeemed_count,
    remaining: status.remaining,
    sold_out: status.sold_out,
  });
}
