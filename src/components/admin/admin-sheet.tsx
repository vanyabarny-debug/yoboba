'use client';

import type { ReactNode } from 'react';

export function admin_sheet({
  open,
  title,
  on_close,
  children,
}: {
  open: boolean;
  title: string;
  on_close: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/35"
        onClick={on_close}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-card p-5 shadow-soft max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
