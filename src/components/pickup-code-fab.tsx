'use client';

type props = {
  on_click: () => void;
  hidden?: boolean;
};

export default function pickup_code_fab({ on_click, hidden = false }: props) {
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={on_click}
      className="fixed z-40 min-[1024px]:hidden left-[calc(1rem+var(--safe-left))] bottom-[calc(1rem+var(--safe-bottom))] flex items-center gap-2 rounded-pill bg-accent-soft text-white pl-4 pr-5 py-3 shadow-[0_4px_16px_rgba(0,45,122,0.28)] font-extrabold text-[17px] animate-in fade-in zoom-in-95 duration-200"
      aria-label="мой код для кассы"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4h7v7H4V4zm2 2v3h3V6H6zm7-2h7v7h-7V4zm2 2v3h3V6h-3zM4 13h7v7H4v-7zm2 2v3h3v-3H6zm9 0h2v2h-2v-2zm4-2h3v3h-3v-3zm-4 4h2v5h-2v-5zm4 2h3v5h-3v-5z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span>мой код</span>
    </button>
  );
}
