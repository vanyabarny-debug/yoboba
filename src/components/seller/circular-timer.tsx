'use client';

type props = {
  /** 0 = пусто, 1 = полный круг */
  progress: number;
  label: string;
  sublabel?: string;
  /** caps — мелкий uppercase; plain — обычный текст (таймер) */
  sublabel_style?: 'caps' | 'plain';
  urgent?: boolean;
  active?: boolean;
  disabled?: boolean;
  tone?: 'idle' | 'cooking' | 'ready' | 'pay' | 'handout' | 'done';
  /** компактнее для сетки 2 в ряд */
  compact?: boolean;
  /** заполняет родителя (aspect-square контейнер) */
  fill?: boolean;
  /** крупная цифра (номер заказа) */
  hero?: boolean;
  on_click: () => void;
};

const tones: Record<NonNullable<props['tone']>, { ring: string; fill: string; text: string }> = {
  idle: {
    ring: '#c4c4c8',
    fill: '#1c1c1f',
    text: '#ffffff',
  },
  cooking: {
    ring: '#1c1c1f',
    fill: '#ffffff',
    text: '#1c1c1f',
  },
  ready: {
    ring: '#1c1c1f',
    fill: '#f4f4f5',
    text: '#1c1c1f',
  },
  pay: {
    ring: '#1c1c1f',
    fill: '#1c1c1f',
    text: '#ffffff',
  },
  handout: {
    ring: '#ff6b6b',
    fill: '#ff6b6b',
    text: '#ffffff',
  },
  done: {
    ring: '#a1a1aa',
    fill: '#f4f4f5',
    text: '#3f3f46',
  },
};

export default function circular_timer({
  progress,
  label,
  sublabel,
  sublabel_style = 'caps',
  urgent = false,
  active = false,
  disabled = false,
  tone = 'idle',
  compact = false,
  fill = false,
  hero = false,
  on_click,
}: props) {
  const size = fill ? 100 : compact ? 88 : 160;
  const stroke = fill ? 5.5 : compact ? 4.5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  const colors = tones[tone];

  const label_class = hero
    ? fill
      ? 'text-[clamp(1.35rem,12cqw,2.35rem)] font-bold tabular-nums leading-none tracking-tight'
      : 'text-2xl font-bold tabular-nums leading-none'
    : fill
      ? label.length > 10
        ? 'text-[clamp(0.7rem,4.5cqw,1.15rem)] font-semibold leading-tight'
        : label.length > 6
          ? 'text-[clamp(0.85rem,5.5cqw,1.35rem)] font-semibold leading-tight'
          : 'text-[clamp(1rem,7cqw,1.65rem)] font-semibold leading-tight'
      : compact
        ? label.length > 10
          ? 'text-[11px] font-semibold leading-tight'
          : label.length > 6
            ? 'text-sm font-semibold leading-tight'
            : 'text-base font-semibold leading-tight'
        : label.length > 10
          ? 'text-sm font-semibold leading-tight'
          : label.length > 6
            ? 'text-lg font-semibold leading-tight'
            : 'text-xl font-semibold leading-tight';

  const sub_class =
    sublabel_style === 'plain'
      ? fill
        ? 'mt-1 text-[clamp(0.7rem,4.2cqw,1rem)] font-semibold tabular-nums leading-none'
        : 'mt-0.5 text-sm font-semibold tabular-nums leading-none'
      : fill
        ? 'mt-0.5 text-[clamp(0.55rem,3cqw,0.7rem)] font-medium uppercase tracking-wide opacity-55'
        : 'mt-0.5 text-[9px] font-medium uppercase tracking-wide opacity-55';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={on_click}
      className={`relative block shrink-0 rounded-full transition active:scale-[0.97] disabled:opacity-45 ${
        fill ? 'h-full w-full max-h-full max-w-full' : 'mx-auto'
      } ${urgent ? 'animate-[pulse_0.55s_ease-in-out_infinite]' : ''}`}
      style={fill ? undefined : { width: size, height: size }}
      aria-label={label || 'таймер'}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        className={`-rotate-90 ${fill ? 'h-full w-full' : ''}`}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill={colors.fill}
          stroke="#e4e4e7"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: active ? 'stroke-dashoffset 0.9s linear' : 'stroke-dashoffset 0.35s ease',
          }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex flex-col items-center justify-center text-center ${
          fill ? 'px-[12%]' : compact ? 'px-2' : 'px-4'
        }`}
      >
        {label ? (
          <span className={label_class} style={{ color: colors.text }}>
            {label}
          </span>
        ) : null}
        {sublabel ? (
          <span
            className={sub_class}
            style={{ color: colors.text, opacity: sublabel_style === 'plain' ? 0.72 : undefined }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
