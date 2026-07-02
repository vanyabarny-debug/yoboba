'use client';

import { createElement, useRef, useState } from 'react';
import edit_pencil from '@/components/admin/edit-pencil';
import menu_photo_crop_modal from '@/components/admin/menu-photo-crop-modal';

type props = {
  on_save: (data_url: string) => void;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
};

export default function product_photo_picker({
  on_save,
  label = 'загрузить фото',
  className = '',
  size = 'md',
  title = 'фото товара',
}: props) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending_file, set_pending_file] = useState<File | null>(null);
  const [crop_open, set_crop_open] = useState(false);

  function open_file() {
    ref.current?.click();
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            set_pending_file(file);
            set_crop_open(true);
          }
          e.target.value = '';
        }}
      />
      {createElement(edit_pencil, {
        label,
        onClick: open_file,
        className: `${size === 'sm' ? 'h-6 w-6' : 'h-9 w-9'} ${className}`,
      })}
      {createElement(menu_photo_crop_modal, {
        open: crop_open,
        file: pending_file,
        title,
        on_close: () => {
          set_crop_open(false);
          set_pending_file(null);
        },
        on_save: (data_url) => {
          on_save(data_url);
          set_crop_open(false);
          set_pending_file(null);
        },
      })}
    </>
  );
}

export function product_photo_button({
  on_save,
  label = 'выбрать фото',
  className = '',
  title = 'фото товара',
}: {
  on_save: (data_url: string) => void;
  label?: string;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending_file, set_pending_file] = useState<File | null>(null);
  const [crop_open, set_crop_open] = useState(false);

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            set_pending_file(file);
            set_crop_open(true);
          }
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`rounded-pill bg-accent text-accent-foreground px-4 py-2 text-sm font-medium ${className}`}
      >
        {label}
      </button>
      {createElement(menu_photo_crop_modal, {
        open: crop_open,
        file: pending_file,
        title,
        on_close: () => {
          set_crop_open(false);
          set_pending_file(null);
        },
        on_save: (data_url) => {
          on_save(data_url);
          set_crop_open(false);
          set_pending_file(null);
        },
      })}
    </>
  );
}
