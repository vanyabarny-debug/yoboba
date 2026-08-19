import webpush from 'web-push';
import { read_json_store, write_json_store } from '@/lib/data-store';

export type vapid_keys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const store_key = 'vapid-keys';
const default_subject = 'mailto:hello@yomoyo.ru';

let write_chain: Promise<unknown> = Promise.resolve();

function env_keys(): vapid_keys | null {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || default_subject;
  if (!publicKey || publicKey.includes('your-vapid') || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export async function get_vapid_keys(): Promise<vapid_keys> {
  const from_env = env_keys();
  if (from_env) return from_env;

  const run = write_chain.then(async () => {
    const stored = await read_json_store<vapid_keys | null>(store_key, null);
    if (stored?.publicKey && stored?.privateKey) {
      return {
        publicKey: stored.publicKey,
        privateKey: stored.privateKey,
        subject: stored.subject || default_subject,
      };
    }
    const generated = webpush.generateVAPIDKeys();
    const next: vapid_keys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject: default_subject,
    };
    await write_json_store(store_key, next);
    return next;
  });
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function vapid_is_ready() {
  try {
    const keys = await get_vapid_keys();
    return Boolean(keys.publicKey && keys.privateKey);
  } catch {
    return false;
  }
}
