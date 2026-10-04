/** шаблоны задач дня: админ пишет страницы, бариста видит их на смене */

export type day_task_media = {
  id: string;
  kind: 'image' | 'video';
};

export type day_task_block = {
  id: string;
  /** мелкая подпись над текстом */
  kicker: string;
  text: string;
  media: day_task_media | null;
};

/** что бариста должен приложить, чтобы закрыть задачу */
export type day_task_proof = 'none' | 'photo' | 'video' | 'any';

export type day_task_template = {
  id: string;
  title: string;
  hint: string;
  /** HH:MM по Москве — когда карточка появляется */
  appear_at: string;
  /** 0 — без таймера */
  expected_minutes: number;
  proof: day_task_proof;
  blocks: day_task_block[];
};

export type day_task_proof_record = {
  id: string;
  template_id: string;
  spot_id: string;
  day: string;
  seller_id: string;
  media: day_task_media;
  created_at: string;
};

export const day_task_media_url = (id: string) => `/api/day-task-media/${id}`;

function block(id: string, kicker: string, text: string): day_task_block {
  return { id, kicker, text, media: null };
}

/** стартовый день, пока админ не переписал задачи */
export const default_day_tasks: day_task_template[] = [
  {
    id: 'journals',
    title: 'журналы',
    hint: 'расписаться в журналах смены',
    appear_at: '10:00',
    expected_minutes: 5,
    proof: 'none',
    blocks: [
      block('journals-1', 'взять', 'журналы смены с полки'),
      block('journals-2', 'расписаться', 'открытие, уборка, касса'),
      block('journals-3', 'вернуть', 'журналы на место'),
    ],
  },
  {
    id: 'showcase',
    title: 'витрина',
    hint: 'протереть стекло и полки',
    appear_at: '11:30',
    expected_minutes: 10,
    proof: 'none',
    blocks: [
      block('showcase-1', 'протереть', 'стекло витрины'),
      block('showcase-2', 'протереть', 'полки внутри'),
      block('showcase-3', 'поправить', 'выкладку'),
    ],
  },
  {
    id: 'floor',
    title: 'пол у кассы',
    hint: 'подмести и протереть зону выдачи',
    appear_at: '13:00',
    expected_minutes: 8,
    proof: 'none',
    blocks: [
      block('floor-1', 'подмести', 'зону выдачи'),
      block('floor-2', 'протереть', 'пол у кассы'),
      block('floor-3', 'убрать', 'мусор с пола'),
    ],
  },
  {
    id: 'oil-change',
    title: 'сдать масло',
    hint: 'замена и сдача отработки',
    appear_at: '15:00',
    expected_minutes: 15,
    proof: 'none',
    blocks: [
      block('oil-1', 'выключить', 'фритюр и дать остыть'),
      block('oil-2', 'слить', 'отработку'),
      block('oil-3', 'залить', 'свежее масло'),
      block('oil-4', 'отметить', 'в журнале'),
    ],
  },
  {
    id: 'fryer-clean',
    title: 'уборка фритюра',
    hint: 'слить, протереть, собрать',
    appear_at: '17:00',
    expected_minutes: 20,
    proof: 'none',
    blocks: [
      block('fryer-1', 'слить', 'масло'),
      block('fryer-2', 'снять', 'корзины и протереть'),
      block('fryer-3', 'промыть', 'чашу'),
      block('fryer-4', 'собрать', 'и вернуть масло'),
    ],
  },
  {
    id: 'trash',
    title: 'мусор',
    hint: 'вынести пакеты, сменить мешки',
    appear_at: '18:30',
    expected_minutes: 5,
    proof: 'none',
    blocks: [
      block('trash-1', 'собрать', 'пакеты из урн'),
      block('trash-2', 'вынести', 'на площадку'),
      block('trash-3', 'сменить', 'мешки'),
    ],
  },
];

const proofs = new Set<day_task_proof>(['none', 'photo', 'video', 'any']);

function clean_media(raw: unknown): day_task_media | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const kind = rec.kind === 'video' ? 'video' : rec.kind === 'image' ? 'image' : '';
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || !kind) return null;
  return { id, kind };
}

export function parse_day_tasks(raw: unknown): day_task_template[] | null {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  const tasks: day_task_template[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const hint = typeof rec.hint === 'string' ? rec.hint.trim() : '';
    const appear_at = typeof rec.appear_at === 'string' ? rec.appear_at.trim() : '';
    const minutes = Number(rec.expected_minutes);
    const proof = rec.proof as day_task_proof;
    if (!/^[a-zA-Z0-9-]{2,80}$/.test(id)) return null;
    if (!title || title.length > 80) return null;
    if (hint.length > 160) return null;
    if (!/^\d{2}:\d{2}$/.test(appear_at)) return null;
    const [hh, mm] = appear_at.split(':').map((n) => Number(n));
    if (hh > 23 || mm > 59) return null;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) return null;
    if (!proofs.has(proof)) return null;
    if (!Array.isArray(rec.blocks) || rec.blocks.length < 1 || rec.blocks.length > 12) return null;
    const blocks: day_task_block[] = [];
    for (const item of rec.blocks) {
      if (!item || typeof item !== 'object') return null;
      const b = item as Record<string, unknown>;
      const bid = typeof b.id === 'string' ? b.id.trim() : '';
      const kicker = typeof b.kicker === 'string' ? b.kicker.trim() : '';
      const text = typeof b.text === 'string' ? b.text.trim() : '';
      const media = clean_media(b.media);
      if (!/^[a-zA-Z0-9-]{2,80}$/.test(bid)) return null;
      if (kicker.length > 40) return null;
      if (text.length > 2000) return null;
      if (!text && !media) return null;
      blocks.push({ id: bid, kicker, text, media });
    }
    tasks.push({
      id,
      title,
      hint,
      appear_at,
      expected_minutes: minutes,
      proof,
      blocks,
    });
  }
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) return null;
  return tasks;
}
