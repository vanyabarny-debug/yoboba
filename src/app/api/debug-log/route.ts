import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

const log_path = join(process.cwd(), '.cursor/debug-470d82.log');

export async function POST(request: Request) {
  try {
    const entry = await request.json();
    const line = `${JSON.stringify({ ...entry, timestamp: entry.timestamp || Date.now() })}\n`;
    const dir = join(process.cwd(), '.cursor');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(log_path, line, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
