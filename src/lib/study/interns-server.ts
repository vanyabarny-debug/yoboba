import { read_json_store, write_json_store } from '@/lib/data-store';
import { normalize_phone } from '@/lib/phone';
import {
  intern_statuses,
  type intern,
  type intern_quiz_block,
  type intern_quiz_item,
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

function last10(phone: string) {
  return phone.replace(/\D/g, '').slice(-10);
}

function parse_quiz_item(raw: unknown): intern_quiz_item | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const question = as_string(row.question);
  if (!question) return null;
  const attempts = Array.isArray(row.attempts)
    ? row.attempts
        .map((attempt) => {
          if (!attempt || typeof attempt !== 'object') return null;
          const picks_raw = (attempt as { picks?: unknown }).picks;
          const picks = Array.isArray(picks_raw)
            ? picks_raw
                .map((pick) => {
                  if (!pick || typeof pick !== 'object') return null;
                  const text = as_string((pick as { text?: unknown }).text);
                  if (!text) return null;
                  return { text, ok: (pick as { ok?: unknown }).ok === true };
                })
                .filter((x): x is { text: string; ok: boolean } => Boolean(x))
            : [];
          return picks.length ? { picks } : null;
        })
        .filter((x): x is { picks: { text: string; ok: boolean }[] } => Boolean(x))
    : [];
  const wrong = as_schedule(row.wrong);
  const correct = as_schedule(row.correct);
  if (attempts.length === 0 && wrong.length) {
    attempts.push({ picks: wrong.map((text) => ({ text, ok: false })) });
    if (correct.length) attempts.push({ picks: correct.map((text) => ({ text, ok: true })) });
  }
  return {
    question,
    ok: row.ok === true,
    tries: Number.isFinite(Number(row.tries)) ? Number(row.tries) : Math.max(attempts.length, 1),
    correct,
    wrong,
    attempts,
  };
}

function parse_quiz_block(raw: unknown): intern_quiz_block | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const items = Array.isArray(row.items)
    ? row.items.map(parse_quiz_item).filter((x): x is intern_quiz_item => Boolean(x))
    : [];
  return {
    id: as_string(row.id) || as_string(row.title) || 'block',
    title: as_string(row.title) || 'раздел',
    clean: Number.isFinite(Number(row.clean)) ? Number(row.clean) : items.filter((x) => x.ok).length,
    total: Number.isFinite(Number(row.total)) ? Number(row.total) : items.length,
    items,
  };
}

function parse_quizzes(raw: unknown): intern_quiz_block[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parse_quiz_block).filter((x): x is intern_quiz_block => Boolean(x));
}

function course_blob(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.course && typeof raw.course === 'object' && !Array.isArray(raw.course)) {
    return raw.course as Record<string, unknown>;
  }
  return {};
}

function parse_intern(raw: Record<string, unknown>): intern {
  const intern_date = as_string(raw.intern_date).slice(0, 10);
  const extra = course_blob(raw);
  const mood_raw = raw.feedback_mood ?? extra.feedback_mood;
  const n = Number(mood_raw);
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
    feedback_mood: n >= 1 && n <= 5 ? n : null,
    feedback_liked: as_string(raw.feedback_liked) || as_string(extra.feedback_liked),
    feedback_disliked: as_string(raw.feedback_disliked) || as_string(extra.feedback_disliked),
    feedback_at: as_string(raw.feedback_at) || as_string(extra.feedback_at) || null,
    quiz_results: parse_quizzes(raw.quiz_results ?? extra.quizzes),
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
    feedback_mood: intern.feedback_mood,
    feedback_liked: intern.feedback_liked,
    feedback_disliked: intern.feedback_disliked,
    feedback_at: intern.feedback_at,
    quiz_results: intern.quiz_results,
    course: {
      feedback_mood: intern.feedback_mood,
      feedback_liked: intern.feedback_liked,
      feedback_disliked: intern.feedback_disliked,
      feedback_at: intern.feedback_at,
      quizzes: intern.quiz_results,
    },
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
    feedback_mood: null,
    feedback_liked: '',
    feedback_disliked: '',
    feedback_at: null,
    quiz_results: [],
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
        feedback_mood: prev.feedback_mood,
        feedback_liked: prev.feedback_liked,
        feedback_disliked: prev.feedback_disliked,
        feedback_at: prev.feedback_at,
        quiz_results: prev.quiz_results,
      };
      const { error } = await admin.from('study_interns').update(to_row(saved)).eq('id', prev.id);
      if (error && !is_missing_table(error.message) && !is_unknown_column(error.message)) throw new Error(error.message);
    } else if (!read_error) {
      const { error } = await admin.from('study_interns').insert(to_row(parsed));
      if (error && !is_missing_table(error.message) && !is_unknown_column(error.message)) throw new Error(error.message);
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
      const remote = data.map((row) => parse_intern(row as Record<string, unknown>));
      const local = await load_local();
      const merged = remote.map((row) => {
        const extra = local.find((l) => last10(l.phone) === last10(row.phone) || l.id === row.id);
        if (!extra) return row;
        return {
          ...row,
          feedback_mood: row.feedback_mood ?? extra.feedback_mood,
          feedback_liked: row.feedback_liked || extra.feedback_liked,
          feedback_disliked: row.feedback_disliked || extra.feedback_disliked,
          feedback_at: row.feedback_at || extra.feedback_at,
          quiz_results: row.quiz_results.length ? row.quiz_results : extra.quiz_results,
        };
      });
      for (const extra of local) {
        if (!merged.some((row) => last10(row.phone) === last10(extra.phone) || row.id === extra.id)) {
          merged.unshift(extra);
        }
      }
      await save_local(merged);
      return merged;
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

export async function save_intern_feedback(input: {
  name?: string;
  phone?: string;
  mood?: number;
  liked?: string;
  disliked?: string;
  quizzes?: intern_quiz_block[];
}): Promise<intern | null> {
  const phone = normalize_phone(input.phone) || as_string(input.phone);
  const digits = last10(phone);
  if (digits.length < 10) throw new Error('нет телефона — отзыв не к чему привязать');

  const mood_n = Math.round(Number(input.mood));
  const mood = mood_n >= 1 && mood_n <= 5 ? mood_n : null;
  const liked = as_string(input.liked);
  const disliked = as_string(input.disliked);
  const quizzes = parse_quizzes(input.quizzes);
  const now = new Date().toISOString();
  const e164 = normalize_phone(phone) || `+7${digits}`;

  const rows = await load_local();
  let current =
    rows.find((row) => last10(row.phone) === digits) ||
    (is_supabase_configured() ? await find_supabase_by_phone(e164, digits) : null);

  if (!current) {
    current = {
      id: crypto.randomUUID(),
      name: as_string(input.name) || 'без имени',
      phone: e164,
      city: '',
      schedule: [],
      intern_date: '',
      intern_time: '',
      urgent: '',
      medbook: '',
      guest: '',
      shift: '',
      cook: '',
      status: 'new',
      created_at: now,
      updated_at: now,
      feedback_mood: null,
      feedback_liked: '',
      feedback_disliked: '',
      feedback_at: null,
      quiz_results: [],
    };
  }

  const next: intern = {
    ...current,
    name: as_string(input.name) || current.name,
    phone: current.phone || e164,
    updated_at: now,
    feedback_mood: mood ?? current.feedback_mood,
    feedback_liked: liked || current.feedback_liked,
    feedback_disliked: disliked || current.feedback_disliked,
    feedback_at: mood || liked || disliked ? now : current.feedback_at,
    quiz_results: quizzes.length ? quizzes : current.quiz_results,
  };

  await write_intern_row(next);
  await upsert_local(next);
  return next;
}

async function find_supabase_by_phone(e164: string, digits: string): Promise<intern | null> {
  const admin = create_service_client();
  const { data, error } = await admin.from('study_interns').select('*').eq('phone', e164).maybeSingle();
  if (!error && data) return parse_intern(data as Record<string, unknown>);
  const { data: all, error: list_error } = await admin.from('study_interns').select('*').limit(500);
  if (list_error || !all) return null;
  const found = all.find((row) => last10(as_string((row as { phone?: string }).phone)) === digits);
  return found ? parse_intern(found as Record<string, unknown>) : null;
}

function is_unknown_column(message: string | undefined) {
  const msg = message || '';
  return /feedback_mood|quiz_results|course|schema cache|does not exist|could not find/i.test(msg);
}

async function write_intern_row(row: intern) {
  if (!is_supabase_configured()) return;
  const admin = create_service_client();
  const full = to_row(row);
  const { data: by_phone } = await admin.from('study_interns').select('id').eq('phone', row.phone).maybeSingle();
  const id = as_string(by_phone?.id) || row.id;
  const payload = { ...full, id };
  const query = by_phone
    ? admin.from('study_interns').update(payload).eq('id', id)
    : admin.from('study_interns').insert(payload);
  const { error } = await query;
  if (!error) return;
  if (!is_unknown_column(error.message) && !is_missing_table(error.message)) {
    throw new Error(error.message);
  }
  const slim = {
    id,
    name: row.name,
    phone: row.phone,
    city: row.city,
    schedule: row.schedule,
    intern_date: row.intern_date || null,
    intern_time: row.intern_time || null,
    urgent: row.urgent,
    medbook: row.medbook,
    guest: row.guest,
    shift: row.shift,
    cook: row.cook,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const retry = by_phone
    ? await admin.from('study_interns').update(slim).eq('id', id)
    : await admin.from('study_interns').insert(slim);
  if (retry.error && !is_missing_table(retry.error.message) && !is_unknown_column(retry.error.message)) {
    throw new Error(retry.error.message);
  }
}
