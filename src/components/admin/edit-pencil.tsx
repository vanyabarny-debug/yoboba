type props = {
  label?: string;
  onClick: () => void;
  className?: string;
};

export default function edit_pencil({ label = 'править', onClick, className = '' }: props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-neutral-700 shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:bg-white hover:text-accent transition-colors ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
