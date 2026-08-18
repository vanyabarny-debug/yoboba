'use client';

/** корзина на колёсиках — сразу читается как «корзина», не пакет */
export default function cart_mark({
  size = 20,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M3 4.5h2.15l.55 2.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M6.1 6.7h13.4l-1.55 7.05a1.7 1.7 0 01-1.67 1.35H9.05A1.7 1.7 0 017.4 13.8L5.7 6.7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 12.2h8.3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="9.2" cy="18.4" r="1.55" fill="currentColor" />
      <circle cx="16.6" cy="18.4" r="1.55" fill="currentColor" />
    </svg>
  );
}
