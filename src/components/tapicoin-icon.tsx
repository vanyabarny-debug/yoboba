'use client';

/** кружок с «бб» — знак бобаллов */
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
        fontSize: Math.max(8, Math.round(size * 0.38)),
        letterSpacing: '-0.04em',
      }}
      aria-hidden
    >
      бб
    </span>
  );
}
