'use client';

/** монетка бобаллов — крупный кружок с «бб» */
export default function TapicoinIcon({
  size = 18,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const font = Math.max(9, Math.round(size * 0.42));
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#0039A6] text-white font-mono font-black leading-none select-none shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.18)] ring-2 ring-white/35 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: font,
        letterSpacing: '-0.06em',
      }}
      aria-hidden
      title="бобаллы"
    >
      бб
    </span>
  );
}
