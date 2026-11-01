import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const prefix = 'gcm1';

function vault_key() {
  const raw = process.env.STAFF_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!raw) return null;
  return createHash('sha256').update(`${raw}:staff-password-view`).digest();
}

/** обратимая копия пароля, чтобы админ мог его посмотреть; вход проверяется только по хешу */
export function seal_staff_password(password: string): string | undefined {
  const key = vault_key();
  if (!key || !password) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [prefix, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('$');
}

export function open_staff_password(sealed: string | undefined): string | null {
  const key = vault_key();
  if (!key || !sealed) return null;
  const [tag_prefix, iv, tag, body] = sealed.split('$');
  if (tag_prefix !== prefix || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
