import { read_json_store, write_json_store } from '@/lib/data-store';

export const VIRAL_25K_LIMIT = 50;
const store_key = 'viral-25k';

type viral_25k_store = {
  redeemed_count: number;
  limit: number;
};

let write_chain: Promise<unknown> = Promise.resolve();

function with_lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = write_chain.then(fn, fn);
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function load_store(): Promise<viral_25k_store> {
  const raw = await read_json_store<Partial<viral_25k_store>>(store_key, {});
  return {
    limit: Math.max(1, Number(raw.limit) || VIRAL_25K_LIMIT),
    redeemed_count: Math.max(0, Number(raw.redeemed_count) || 0),
  };
}

async function save_store(next: viral_25k_store) {
  await write_json_store(store_key, next);
}

export type viral_25k_status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
};

export async function get_viral_25k_status(): Promise<viral_25k_status> {
  await write_chain.catch(() => undefined);
  const store = await load_store();
  const remaining = Math.max(0, store.limit - store.redeemed_count);
  return {
    limit: store.limit,
    redeemed_count: store.redeemed_count,
    remaining,
    sold_out: remaining <= 0,
  };
}

/** зафиксировать выдачу одного бесплатного напитка (касса / админ) */
export async function redeem_viral_25k(): Promise<viral_25k_status> {
  return with_lock(async () => {
    const store = await load_store();
    if (store.redeemed_count >= store.limit) {
      throw new Error('бесплатные напитки по акции закончились');
    }
    const next = { ...store, redeemed_count: store.redeemed_count + 1 };
    await save_store(next);
    const remaining = Math.max(0, next.limit - next.redeemed_count);
    return {
      limit: next.limit,
      redeemed_count: next.redeemed_count,
      remaining,
      sold_out: remaining <= 0,
    };
  });
}

export async function set_viral_25k_counts(input: {
  redeemed_count?: number;
  limit?: number;
}): Promise<viral_25k_status> {
  return with_lock(async () => {
    const store = await load_store();
    const limit =
      input.limit !== undefined ? Math.max(1, Math.round(Number(input.limit) || 1)) : store.limit;
    const redeemed_count =
      input.redeemed_count !== undefined
        ? Math.max(0, Math.min(limit, Math.round(Number(input.redeemed_count) || 0)))
        : Math.min(store.redeemed_count, limit);
    const next = { limit, redeemed_count };
    await save_store(next);
    const remaining = Math.max(0, next.limit - next.redeemed_count);
    return {
      limit: next.limit,
      redeemed_count: next.redeemed_count,
      remaining,
      sold_out: remaining <= 0,
    };
  });
}
