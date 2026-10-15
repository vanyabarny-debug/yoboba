export function bills_icon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="7" y="11" width="20" height="13" rx="2.2" fill="#15803d" />
      <rect x="4" y="7" width="20" height="13" rx="2.2" fill="#22c55e" />
      <circle cx="14" cy="13.5" r="3.1" fill="none" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

export function card_icon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="7" width="26" height="18" rx="3" fill="#2a2a2a" />
      <rect x="3" y="12" width="26" height="4" fill="#141414" />
      <rect x="6.5" y="18.5" width="6" height="3.2" rx="0.7" fill="#d4d4d4" />
    </svg>
  );
}
