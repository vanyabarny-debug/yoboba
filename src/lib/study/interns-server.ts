import { read_json_store, write_json_store } from '@/lib/data-store';
import { normalize_phone } from '@/lib/phone';
import {
  intern_statuses,
  type intern,
  type intern_status,
} from '@/lib/study/interns';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';

export type { intern, intern_status };
export { intern_status_label, intern_statuses } from '@/lib/study/interns';

export type intern_apply_input = {
  name: string;
  phone: string;
  city: string;
  when?: string[];
  schedule?: string[];
  intern_date: string;
  intern_time: string;
  urgent: string;
  medbook: string;
  guest: string;
  shift?: string;
  cook: string;
};

const store_key = 'study-interns';

function is_status(value: unknown): value is intern_status {
  return intern_statuses.includes(value as intern_status);
}

function is_missing_table(message: string | undefined) {
  const msg = message || '';
  return /study_interns/i.test(msg) && /does not exist|schema cache|could not find/i.test(msg);
}

function as_string(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function as_schedule(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => as_string(x)).filter(Boolean);
}

function parse_intern(raw: Record<string, unknown>): intern {
  const intern_date = as_string(raw.intern_date).slice(0, 10);
  return {
    id: as_string(raw.id) || crypto.randomUUID(),
    name: as_string(raw.name),
    phone: as_string(raw.phone),
    city: as_string(raw.city),
    schedule: as_schedule(raw.schedule ?? raw.when),
    intern_date: /^\d{4}-\d{2}-\d{2}$/.test(intern_date) ? intern_date : '',
    intern_time: /^\d{2}:\d{2}$/.test(as_string(raw.intern_time)) ? as_string(raw.intern_time) : '',
    urgent: as_string(raw.urgent),
    medbook: as_string(raw.medbook),
    guest: as_string(raw.guest),
    shift: as_string(raw.shift),
    cook: as_string(raw.cook),
    status: is_status(raw.status) ? raw.status : 'new',
    created_at: as_string(raw.created_at) || new Date().toISOString(),
    updated_at: as_string(raw.updated_at) || new Date().toISOString(),
  };
}

function to_row(intern: intern) {
  return {
    id: intern.id,
    name: intern.name,
    phone: intern.phone,
    city: intern.city,
    schedule: intern.schedule,
    intern_date: intern.intern_date || null,
    intern_time: intern.intern_time || null,
    urgent: intern.urgent,
    medbook: intern.medbook,
    guest: intern.guest,
    shift: intern.shift,
    cook: intern.cook,
    status: intern.status,
    created_at: intern.created_at,
    updated_at: intern.updated_at,
  };
}

async function load_local(): Promise<intern[]> {
  const raw = await read_json_store<unknown[]>(store_key, []);
  return raw.map((row) => parse_intern((row || {}) as Record<string, unknown>));
}

async function save_local(rows: intern[]) {
  await write_json_store(store_key, rows);
}

async function upsert_local(next: intern) {
  const rows = await load_local();
  const idx = rows.findIndex((row) => row.phone === next.phone || row.id === next.id);
  if (idx >= 0) {
    const merged = { ...rows[idx], ...next, created_at: rows[idx].created_at };
    rows[idx] = merged;
    await save_local(rows);
    return merged;
  }
  rows.unshift(next);
  await save_local(rows);
  return next;
}

export function parse_apply_input(body: intern_apply_input): intern | { error: string } {
  const name = as_string(body.name);
  const phone = normalize_phone(body.phone);
  const city = as_string(body.city);
  const schedule = as_schedule(body.schedule ?? body.when);
  const intern_date = as_string(body.intern_date);
  const intern_time = as_string(body.intern_time);
  const urgent = as_string(body.urgent);
  const medbook = as_string(body.medbook);
  const guest = as_string(body.guest);
  const cook = as_string(body.cook);

  if (name.length < 2) return { error: 'напиши имя' };
  if (!phone) return { error: 'проверь телефон' };
  if (city.length < 2) return { error: 'укажи город' };
  if (schedule.length === 0) return { error: 'выбери график' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(intern_date)) return { error: 'выбери дату' };
  if (!/^\d{2}:\d{2}$/.test(intern_time)) return { error: 'выбери время' };
  if (!urgent) return { error: 'насколько срочно нужна работа?' };
  if (!medbook) return { error: 'медкнижка: да или нет' };
  if (!guest) return { error: 'ответь на сцену с гостем' };
  if (!cook) return { error: 'любишь готовить?' };

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    phone,
    city,
    schedule,
    intern_date,
    intern_time,
    urgent,
    medbook,
    guest,
    shift: as_string(body.shift),
    cook,
    status: 'new',
    created_at: now,
    updated_at: now,
  };
}

export async function upsert_intern(input: intern_apply_input): Promise<intern> {
  const parsed = parse_apply_input(input);
  if ('error' in parsed) throw new Error(parsed.error);

  let saved = parsed;

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { data: existing, error: read_error } = await admin
      .from('study_interns')
      .select('*')
      .eq('phone', parsed.phone)
      .maybeSingle();

    if (read_error && !is_missing_table(read_error.message)) {
      throw new Error(read_error.message);
    }

    if (existing) {
      const prev = parse_intern(existing as Record<string, unknown>);
      saved = {
        ...parsed,
        id: prev.id,
        status: prev.status,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from('study_interns').update(to_row(saved)).eq('id', prev.id);
      if (error && !is_missing_table(error.message)) throw new Error(error.message);
    } else if (!read_error) {
      const { error } = await admin.from('study_interns').insert(to_row(parsed));
      if (error && !is_missing_table(error.message)) throw new Error(error.message);
    }
  }

  return upsert_local(saved);
}

export async function list_interns(): Promise<intern[]> {
  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { data, error } = await admin
      .from('study_interns')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const rows = data.map((row) => parse_intern(row as Record<string, unknown>));
      if (rows.length === 0) {
        const local = await load_local();
        if (local.length > 0) {
          for (const row of local) {
            const { error: up_error } = await admin.from('study_interns').upsert(to_row(row), { onConflict: 'phone' });
            if (up_error && !is_missing_table(up_error.message)) {
              console.error('study_interns migrate', up_error.message);
              break;
            }
          }
          return local;
        }
      }
      await save_local(rows);
      return rows;
    }
    if (error && !is_missing_table(error.message)) {
      console.error('study_interns list', error.message);
    }
  }
  return load_local();
}

export async function set_intern_status(id: string, status: intern_status): Promise<intern | null> {
  const now = new Date().toISOString();

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { data, error } = await admin
      .from('study_interns')
      .update({ status, updated_at: now })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error && !is_missing_table(error.message)) throw new Error(error.message);
    if (data) {
      const next = parse_intern(data as Record<string, unknown>);
      await upsert_local(next);
      return next;
    }
  }

  const rows = await load_local();
  const idx = rows.findIndex((row) => row.id === id);
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], status, updated_at: now };
  await save_local(rows);
  return rows[idx];
}

export async function delete_intern(id: string): Promise<boolean> {
  let removed = false;
  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { error } = await admin.from('study_interns').delete().eq('id', id);
    if (error && !is_missing_table(error.message)) throw new Error(error.message);
    removed = !error;
  }
  const rows = await load_local();
  const next = rows.filter((row) => row.id !== id);
  if (next.length !== rows.length) {
    await save_local(next);
    removed = true;
  }
  return removed;
}
