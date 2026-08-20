'use client';

/** кружок с «б» — знак ко́пи бобов */
export default function TapicoinIcon({
  size = 18,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-[#0039A6] text-white font-mono font-bold leading-none select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.55)),
      }}
      aria-hidden
    >
      б
    </span>
  );
}
