import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pending_dir = join(process.cwd(), 'data', 'vk-pending');

export async function save_pending_vk_session(input: {
  access_token: string;
  refresh_token: string;
}) {
  await mkdir(pending_dir, { recursive: true });
  const id = randomBytes(16).toString('hex');
  await writeFile(
    join(pending_dir, `${id}.json`),
    JSON.stringify({
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      exp: Date.now() + 120_000,
    }),
    { mode: 0o600 }
  );
  return id;
}

export async function read_pending_vk_session(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const path = join(pending_dir, `${id}.json`);
  try {
    const raw = await readFile(path, 'utf8');
    const data = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
      exp?: number;
    };
    if (!data.access_token || !data.refresh_token) return null;
    if (typeof data.exp === 'number' && data.exp < Date.now()) {
      await unlink(path).catch(() => {});
      return null;
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  } catch {
    return null;
  }
}

export async function take_pending_vk_session(id: string) {
  const session = await read_pending_vk_session(id);
  if (!session) return null;
  await unlink(join(pending_dir, `${id}.json`)).catch(() => {});
  return session;
}
