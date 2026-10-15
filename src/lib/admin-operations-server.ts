import { find_profile_by_phone } from '@/lib/bonus-server';
import { read_finance_state } from '@/lib/finance/finance-server';
import { read_money_anchor } from '@/lib/money-anchor';
import { days_in_month, type transaction } from '@/lib/finance/model';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import { get_demo_orders, add_demo_order } from '@/lib/demo-orders-server';
import {
  assert_order_stock,
  record_order_stock,
} from '@/lib/finance/order-stock';
import type { stock_actor } from '@/lib/finance/model';
import { normalize_phone } from '@/lib/phone';
import { allocate_daily_order_number, format_order_number } from '@/lib/order-number';
import { parse_order_items } from '@/lib/order-revise-server';
import { record_order_audit } from '@/lib/order-audit-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { order, order_item } from '@/lib/types';

export type operations_sort =
  | 'created_at_desc'
  | 'created_at_asc'
  | 'total_desc'
  | 'total_asc'
  | 'customer_asc';

export type operations_filters = {
  q?: string;
  status?: order['status'] | 'all';
  payment?: order['payment_type'] | 'all';
  spot_id?: string;
  from?: string;
  to?: string;
  sort?: operations_sort;
  page?: number;
  page_size?: number;
  /** без постраничной нарезки — для ленты операций */
  unpaged?: boolean;
};

export type operation_row = {
  id: string;
  created_at: string;
  order_number: number | null;
  order_day: string | null;
  status: order['status'];
  payment_type: order['payment_type'];
  is_paid: boolean;
  total_price: number;
  customer_name: string | null;
  customer_phone: string | null;
  user_id: string | null;
  spot_id: string | null;
  items: order_item[];
  label: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    bonus_balance: number;
  } | null;
};

function missing_column(message: string) {
  const match = message.match(/column \w+\.([a-z0-9_]+) does not exist/i);
  return match?.[1] ?? null;
}

const order_select =
  'id, user_id, items, total_price, status, payment_type, is_paid, customer_name, customer_phone, pickup_time, created_at, order_number, order_day, spot_id';

async function resolve_guest_user(
  customer_name: string,
  customer_phone: string | null
): Promise<string> {
  const admin = create_service_client();
  if (customer_phone) {
    const existing = await find_profile_by_phone(admin, customer_phone);
    if (existing) return existing.id;

    const email = `walkin-${crypto.randomUUID()}@yoboba.internal`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: customer_name, phone: customer_phone },
    });
    if (error || !created.user) {
      throw new Error(error?.message || 'не удалось создать гостя');
    }
    const user_id = created.user.id;
    const { error: profile_err } = await admin.from('profiles').upsert(
      {
        id: user_id,
        name: customer_name,
        phone: customer_phone,
        bonus_balance: 0,
        role: 'user',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (profile_err) {
      const again = await find_profile_by_phone(admin, customer_phone);
      if (again) {
        await admin.auth.admin.deleteUser(user_id).catch(() => {});
        return again.id;
      }
      await admin.auth.admin.deleteUser(user_id).catch(() => {});
      throw new Error(profile_err.message);
    }
    return user_id;
  }

  const email = `ops-guest-${crypto.randomUUID()}@yoboba.internal`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: customer_name },
  });
  if (error || !created.user) {
    throw new Error(error?.message || 'не удалось создать гостя');
  }
  const user_id = created.user.id;
  await admin.from('profiles').upsert(
    {
      id: user_id,
      name: customer_name,
      bonus_balance: 0,
      role: 'user',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  return user_id;
}

function to_row(
  o: order,
  profiles: Map<string, { id: string; name: string; phone: string | null; bonus_balance: number }>
): operation_row {
  const profile = o.user_id ? profiles.get(o.user_id) || null : null;
  return {
    id: o.id,
    created_at: o.created_at,
    order_number: typeof o.order_number === 'number' ? o.order_number : null,
    order_day: o.order_day || null,
    status: o.status,
    payment_type: o.payment_type,
    is_paid: o.is_paid !== false,
    total_price: Number(o.total_price) || 0,
    customer_name: o.customer_name || profile?.name || null,
    customer_phone: o.customer_phone || profile?.phone || null,
    user_id: o.user_id || null,
    spot_id: o.spot_id || null,
    items: Array.isArray(o.items) ? o.items : [],
    label: `№${format_order_number(o)}`,
    customer: profile
      ? {
          id: profile.id,
          name: profile.name,
          phone: profile.phone,
          bonus_balance: profile.bonus_balance,
        }
      : null,
  };
}

function sort_rows(rows: operation_row[], sort: operations_sort) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'created_at_asc') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sort === 'total_desc') return b.total_price - a.total_price;
    if (sort === 'total_asc') return a.total_price - b.total_price;
    if (sort === 'customer_asc') {
      return (a.customer_name || '').localeCompare(b.customer_name || '', 'ru');
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return copy;
}

function match_filters(row: operation_row, f: operations_filters) {
  if (f.status && f.status !== 'all' && row.status !== f.status) return false;
  if (f.payment && f.payment !== 'all' && row.payment_type !== f.payment) return false;
  if (f.spot_id && row.spot_id && row.spot_id !== f.spot_id) return false;
  if (f.spot_id && !row.spot_id) return false;
  if (f.from) {
    const t = new Date(row.created_at).getTime();
    if (t < new Date(`${f.from}T00:00:00+03:00`).getTime()) return false;
  }
  if (f.to) {
    const t = new Date(row.created_at).getTime();
    if (t > new Date(`${f.to}T23:59:59.999+03:00`).getTime()) return false;
  }
  const q = (f.q || '').trim().toLowerCase();
  if (q) {
    const hay = [
      row.label,
      row.customer_name,
      row.customer_phone,
      row.customer?.name,
      row.customer?.phone,
      ...row.items.map((i) => i.name),
      String(row.total_price),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

async function load_profiles_for(
  user_ids: string[]
): Promise<Map<string, { id: string; name: string; phone: string | null; bonus_balance: number }>> {
  const map = new Map<
    string,
    { id: string; name: string; phone: string | null; bonus_balance: number }
  >();
  if (!user_ids.length || !is_supabase_configured()) return map;
  const admin = create_service_client();
  const uniq = [...new Set(user_ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const { data } = await admin
      .from('profiles')
      .select('id, name, phone, bonus_balance')
      .in('id', chunk);
    for (const row of data || []) {
      map.set(row.id, {
        id: row.id,
        name: (row.name || '').trim() || 'гость',
        phone: row.phone || null,
        bonus_balance: Number(row.bonus_balance) || 0,
      });
    }
  }
  return map;
}

export async function list_operations(filters: operations_filters = {}) {
  const page = Math.max(1, Math.round(filters.page || 1));
  const page_size = Math.min(100, Math.max(10, Math.round(filters.page_size || 40)));
  const sort = filters.sort || 'created_at_desc';

  let orders: order[] = [];
  if (is_supabase_configured()) {
    const admin = create_service_client();
    let select = order_select;
    for (let attempt = 0; attempt < 6; attempt++) {
      let query = admin.from('orders').select(select).order('created_at', { ascending: false });
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.payment && filters.payment !== 'all') {
        query = query.eq('payment_type', filters.payment === 'bonus' ? 'online' : filters.payment);
      }
      if (filters.spot_id) query = query.eq('spot_id', filters.spot_id);
      if (filters.from) query = query.gte('created_at', new Date(`${filters.from}T00:00:00+03:00`).toISOString());
      if (filters.to) query = query.lte('created_at', new Date(`${filters.to}T23:59:59.999+03:00`).toISOString());

      const { data, error } = await query.limit(2000);
      if (!error) {
        orders = (data || []) as unknown as order[];
        break;
      }
      const missing = missing_column(error.message);
      if (!missing) throw new Error(error.message);
      select = select
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && p !== missing)
        .join(', ');
    }
  } else {
    orders = await get_demo_orders(false);
  }

  const profiles = await load_profiles_for(orders.map((o) => o.user_id).filter(Boolean));
  let rows = orders.map((o) => to_row(o, profiles)).filter((row) => match_filters(row, filters));
  rows = sort_rows(rows, sort);

  const revenue = rows
    .filter((r) => r.status !== 'cancelled' && r.is_paid)
    .reduce((s, r) => s + r.total_price, 0);
  const total = rows.length;
  const start = (page - 1) * page_size;
  const page_rows = filters.unpaged ? rows : rows.slice(start, start + page_size);

  return {
    operations: page_rows,
    total,
    revenue,
    page,
    page_size,
    pages: Math.max(1, Math.ceil(total / page_size)),
  };
}

export async function create_operation(input: {
  items: unknown;
  customer_name?: string;
  customer_phone?: string | null;
  payment_type?: order['payment_type'];
  status?: order['status'];
  is_paid?: boolean;
  spot_id?: string | null;
  user_id?: string | null;
  actor: stock_actor;
}): Promise<{ ok: true; operation: operation_row } | { ok: false; error: string; status: number }> {
  const parsed = parse_order_items(input.items);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const items = parsed.items;
  const total_price = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const customer_name = (input.customer_name || '').trim() || 'гость';
  const customer_phone = normalize_phone(input.customer_phone) || null;
  const payment_type = input.payment_type || 'cash';
  const status = input.status || 'completed';
  const is_paid = input.is_paid !== false;
  const spot_id = input.spot_id?.trim() || null;
  const pickup_time = new Date().toISOString();

  if (status !== 'cancelled') {
    const stock_ok = await assert_order_stock({ items: items.filter((i) => i.menu_id) });
    if (!stock_ok.ok) return { ok: false, error: stock_ok.error, status: 409 };
  }

  let created: order | null = null;

  if (is_supabase_configured()) {
    try {
      const admin = create_service_client();
      let user_id = input.user_id?.trim() || null;
      if (user_id && !/^[0-9a-f-]{36}$/i.test(user_id)) {
        user_id = null;
      }
      if (!user_id) {
        user_id = await resolve_guest_user(customer_name, customer_phone);
      }

      const daily = await allocate_daily_order_number(admin);
      const payload: Record<string, unknown> = {
        user_id,
        items,
        total_price,
        payment_type: payment_type === 'bonus' ? 'online' : payment_type,
        is_paid,
        customer_name,
        customer_phone,
        pickup_time,
        status,
        order_number: daily.order_number,
        order_day: daily.order_day,
        ...(spot_id ? { spot_id } : {}),
      };

      let { data, error } = await admin.from('orders').insert(payload).select('*').single();
      if (error && /spot_id/i.test(error.message) && spot_id) {
        const { spot_id: _s, ...rest } = payload;
        const retry = await admin.from('orders').insert(rest).select('*').single();
        data = retry.data;
        error = retry.error;
      }
      if (error && /is_paid|customer_name|customer_phone/i.test(error.message)) {
        const retry = await admin
          .from('orders')
          .insert({
            user_id,
            items,
            total_price,
            payment_type: payment_type === 'bonus' ? 'online' : payment_type,
            pickup_time,
            status,
            order_number: daily.order_number,
            order_day: daily.order_day,
          })
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error || !data) {
        return { ok: false, error: error?.message || 'не удалось создать операцию', status: 500 };
      }
      created = data as order;
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'не удалось создать операцию',
        status: 500,
      };
    }
  } else {
    created = await add_demo_order({
      user_id: input.user_id || 'demo-user',
      items,
      total_price,
      status,
      payment_type,
      is_paid,
      customer_name,
      customer_phone,
      pickup_time,
      ...(spot_id ? { spot_id } : {}),
    });
  }

  if (!created) return { ok: false, error: 'не удалось создать операцию', status: 500 };

  if (status !== 'cancelled' && items.some((i) => i.menu_id)) {
    await record_order_stock({
      orderId: created.id,
      items: items.filter((i) => i.menu_id),
      kind: items.every((i) => i.kind === 'staff') ? 'staff' : 'sale',
    });
  }

  await record_order_audit({
    action: 'create',
    actor_id: input.actor.id,
    actor_name: input.actor.name,
    order_id: created.id,
    order_label: `№${format_order_number(created)}`,
    before: '',
    after: items
      .map((i) => `${i.name} ×${i.quantity} по ${i.price}₽`)
      .join(', '),
    before_total: 0,
    after_total: total_price,
  });

  const profiles = await load_profiles_for(created.user_id ? [created.user_id] : []);
  return { ok: true, operation: to_row(created, profiles) };
}

export type ledger_kind =
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'collection'
  | 'financing'
  | 'fixed';

export type ledger_entry = {
  id: string;
  at: string;
  kind: ledger_kind;
  /** короткая суть: напиток или описание */
  title: string;
  amount: number;
  direction: 'in' | 'out' | 'move';
  /** нал / безнал / бобаллы / не деньги */
  channel: 'cash' | 'card' | 'bonus' | 'none';
  /** входит в баланс нал+безнал */
  counts: boolean;
  lines: { k: string; v: string }[];
  /** id заказа, если это продажа — чтобы поправить нал/безнал */
  order_id: string | null;
  user_id: string | null;
  customer_phone: string | null;
  spot_id: string | null;
};

const payment_label: Record<order['payment_type'], string> = {
  cash: 'наличные',
  card: 'карта',
  online: 'онлайн',
  bonus: 'бобаллы',
};

function tx_iso(month: string, day: number) {
  const dim = days_in_month(month);
  const d = Math.min(dim, Math.max(1, Math.round(day) || 1));
  return `${month}-${String(d).padStart(2, '0')}T12:00:00+03:00`;
}

function tx_kind(t: transaction, opex_ids: Set<string>): ledger_kind {
  const cat = (t.category || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();
  if (cat === 'material') return 'purchase';
  if (cat === 'collection' || cat === 'encashment' || desc.includes('инкассац')) return 'collection';
  if (cat === 'investment' || cat === 'other_income' || t.type === 'income') return 'financing';
  if (opex_ids.has(t.category)) return 'fixed';
  return 'expense';
}

function money_of(entry: Pick<ledger_entry, 'kind' | 'direction' | 'channel' | 'amount' | 'counts'>) {
  if (!entry.counts) return { cash: 0, card: 0 };
  if (entry.kind === 'collection') return { cash: -entry.amount, card: entry.amount };
  if (entry.kind === 'sale') {
    if (entry.channel === 'cash') return { cash: entry.amount, card: 0 };
    if (entry.channel === 'card') return { cash: 0, card: entry.amount };
    return { cash: 0, card: 0 };
  }
  if (entry.direction === 'in') return { cash: entry.amount, card: 0 };
  if (entry.direction === 'out') return { cash: -entry.amount, card: 0 };
  return { cash: 0, card: 0 };
}

function sale_title(row: operation_row) {
  const names = row.items
    .map((item) => {
      const n = normalize_order_item_fields({ name: item.name, volume: item.volume });
      const vol = n.volume ? ` ${n.volume}` : '';
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `${n.name}${vol}${qty}`;
    })
    .filter(Boolean);
  return names.join(', ') || row.label;
}

function sale_entry(row: operation_row): ledger_entry | null {
  if (row.status === 'cancelled') return null;
  const channel =
    row.payment_type === 'cash' ? 'cash' : row.payment_type === 'bonus' ? 'bonus' : 'card';
  const lines: { k: string; v: string }[] = row.items.map((item) => {
    const n = normalize_order_item_fields({ name: item.name, volume: item.volume });
    const vol = n.volume ? ` ${n.volume} мл` : '';
    const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
    return {
      k: `${n.name}${vol}${qty}`,
      v: `${Math.round(item.price * item.quantity).toLocaleString('ru-RU')} ₽`,
    };
  });
  lines.push({ k: 'оплата', v: payment_label[row.payment_type] || row.payment_type });
  if (row.customer_name) lines.push({ k: 'клиент', v: row.customer_name });
  if (row.is_paid === false) lines.push({ k: 'статус', v: 'не оплачен' });
  return {
    id: `sale:${row.id}`,
    at: row.created_at,
    kind: 'sale',
    title: sale_title(row),
    amount: Math.max(0, Math.round(row.total_price)),
    direction: 'in',
    channel,
    counts: row.is_paid !== false && channel !== 'bonus' && row.total_price > 0,
    lines,
    order_id: row.id,
    user_id: row.user_id,
    customer_phone: row.customer_phone,
    spot_id: row.spot_id,
  };
}

function finance_entries(
  state: Awaited<ReturnType<typeof read_finance_state>>
): ledger_entry[] {
  const opex_ids = new Set(state.opexCategories.map((c) => c.id));
  const opex_name = new Map(state.opexCategories.map((c) => [c.id, c.name]));
  const mat_name = new Map(state.materials.map((m) => [m.id, m.name]));
  const out: ledger_entry[] = [];
  for (const month of state.monthsData) {
    for (const t of month.transactions ?? []) {
      const amount = Math.round(Number(t.amount) || 0);
      if (amount <= 0) continue;
      const kind = tx_kind(t, opex_ids);
      const direction: ledger_entry['direction'] =
        kind === 'collection' ? 'move' : kind === 'financing' ? 'in' : 'out';
      const mat = t.materialId ? mat_name.get(t.materialId) : undefined;
      const cat_name = opex_name.get(t.category);
      const title = (t.description || '').trim() || mat || cat_name || kind;
      const lines: { k: string; v: string }[] = [];
      if (mat && mat !== title) lines.push({ k: 'материал', v: mat });
      if (cat_name) lines.push({ k: 'статья', v: cat_name });
      if (t.quantity && t.quantity > 0) {
        lines.push({ k: 'количество', v: String(t.quantity) });
      }
      out.push({
        id: `tx:${t.id}`,
        at: tx_iso(month.month, t.day),
        kind,
        title,
        amount,
        direction,
        channel: kind === 'collection' ? 'card' : direction === 'in' ? 'cash' : 'cash',
        counts: true,
        lines,
        order_id: null,
        user_id: null,
        customer_phone: null,
        spot_id: null,
      });
    }
  }
  return out;
}

/** продажи + закупки, расходы, инкассация, финансирование, постоянные расходы */
export async function list_ledger(input: { spot_id?: string } = {}) {
  const spot_id = input.spot_id?.trim() || undefined;
  const [packed, state, anchor] = await Promise.all([
    list_operations({ spot_id, unpaged: true, status: 'all' }),
    read_finance_state(),
    read_money_anchor(),
  ]);
  const sales = packed.operations.map(sale_entry).filter((row): row is ledger_entry => Boolean(row));
  const entries = [...sales, ...finance_entries(state)].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const since = anchor ? new Date(anchor.at).getTime() : Number.NEGATIVE_INFINITY;
  let cash = anchor ? anchor.cash : 0;
  let card = anchor ? anchor.card : 0;
  for (const entry of entries) {
    if (new Date(entry.at).getTime() <= since) continue;
    const part = money_of(entry);
    cash += part.cash;
    card += part.card;
  }
  cash = Math.round(cash);
  card = Math.round(card);
  return { entries, cash, card, balance: cash + card, anchor };
}
