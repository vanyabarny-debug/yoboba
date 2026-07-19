'use client';

type props = {
  count: number;
  total: number;
  on_click: () => void;
};

export default function cart_fab({ count, total, on_click }: props) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={on_click}
      data-cart-target
      className="fixed mobile-fab-offset z-40 min-[1024px]:hidden flex items-center gap-2 rounded-pill bg-accent text-accent-foreground pl-4 pr-5 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.18)] font-semibold animate-in fade-in zoom-in-95 duration-200"
      aria-label={`корзина, ${total} рублей`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M3 6h18" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      <span>{total} ₽</span>
      <span className="bg-white text-accent text-xs font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1">
        {count}
      </span>
    </button>
  );
}
