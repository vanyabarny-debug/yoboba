'use client';

type props = {
  /** 0 = пусто, 1 = полный круг */
  progress: number;
  label: string;
  sublabel?: string;
  urgent?: boolean;
  active?: boolean;
  disabled?: boolean;
  tone?: 'idle' | 'cooking' | 'ready' | 'pay' | 'handout' | 'done';
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
  urgent = false,
  active = false,
  disabled = false,
  tone = 'idle',
  on_click,
}: props) {
  const size = 160;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  const colors = tones[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={on_click}
      className={`relative mx-auto block shrink-0 rounded-full transition active:scale-[0.97] disabled:opacity-45 ${
        urgent ? 'animate-[pulse_0.55s_ease-in-out_infinite]' : ''
      }`}
      style={{ width: size, height: size }}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
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
      <span className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <span
          className={`font-semibold leading-tight ${
            label.length > 10 ? 'text-sm' : label.length > 6 ? 'text-lg' : 'text-xl'
          }`}
          style={{ color: colors.text }}
        >
          {label}
        </span>
        {sublabel ? (
          <span
            className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-55"
            style={{ color: colors.text }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
