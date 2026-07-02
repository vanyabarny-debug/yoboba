'use client';

import { createElement } from 'react';
import spot_picker from '@/components/spot-picker';
import type { user_location } from '@/lib/location';

type props = {
  open: boolean;
  on_close: () => void;
  on_confirm: (loc: user_location) => void;
};

export default function location_modal({ open, on_close, on_confirm }: props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={on_close}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-soft max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-1">точка выдачи</h2>
        <p className="text-sm text-neutral-500 mb-4">выберите адрес, где заберёте заказ</p>
        {createElement(spot_picker, {
          on_confirm: (loc) => {
            on_confirm(loc);
            on_close();
          },
        })}
      </div>
    </div>
  );
}
