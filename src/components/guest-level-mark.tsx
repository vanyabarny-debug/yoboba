import { level_ink, type fresh_tone } from '@/lib/guest-rank';

export type level_mark = {
  rank: number;
  type_name: string;
  color: string;
  weight: number;
  who: string;
  rush?: boolean;
  cooling?: boolean;
  fresh?: fresh_tone | null;
};

const FRESH: Record<fresh_tone, { color: string; title: string }> = {
  hot: { color: '#16a34a', title: '1–3 дня с визита — высокий шанс, что вернётся' },
  nudge: { color: '#ca8a04', title: '4–10 дней — пора напомнить' },
  gone: { color: '#dc2626', title: '11+ дней — уходит в мёртвую базу' },
};

export function GuestLevelMark({ level }: { level: level_mark }) {
  const ink = level_ink(level);
  const fresh = level.fresh ? FRESH[level.fresh] : null;
  return (
    <span className="group/kind relative inline-flex items-center gap-1">
      <span className="tabular-nums leading-none" style={{ color: ink, fontWeight: level.weight }}>
        {level.rank}
      </span>
      <span className="text-[13px] leading-none" style={{ color: ink, fontWeight: level.weight }}>
        {level.type_name}
      </span>
      {level.rush ? (
        <span title="пришёл в течение 4 дней — уровень +1 на эту неделю" className="text-[12px] leading-none">
          ↑
        </span>
      ) : null}
      {level.cooling ? (
        <span title="больше 14 дней без визита — скажи что-то тёплое" className="text-[12px] leading-none">
          ⏳
        </span>
      ) : null}
      {fresh ? (
        <span
          title={fresh.title}
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: fresh.color }}
        />
      ) : null}
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-56 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-neutral-600 shadow-lg group-hover/kind:block">
        <span className="block text-xs font-semibold" style={{ color: level.color }}>
          {level.type_name}
        </span>
        {level.who}
        {level.rush ? (
          <span className="mt-1 block">+1 на неделю: зашёл раньше, чем через 4 дня</span>
        ) : null}
        {level.cooling ? (
          <span className="mt-1 block">статус остывает — с последнего визита больше 14 дней</span>
        ) : null}
        {fresh ? <span className="mt-1 block">{fresh.title}</span> : null}
      </span>
    </span>
  );
}
