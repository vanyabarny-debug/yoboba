'use client';

import { createElement, useRef } from 'react';
import { read_image_file } from '@/lib/image-upload';
import edit_pencil from '@/components/admin/edit-pencil';

type props = {
  on_pick: (data_url: string) => void | Promise<void>;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
};

export default function image_file_picker({
  on_pick,
  label = 'загрузить фото',
  className = '',
  size = 'md',
}: props) {
  const ref = useRef<HTMLInputElement>(null);

  async function handle_change(file: File | undefined) {
    if (!file) return;
    try {
      const data_url = await read_image_file(file);
      await on_pick(data_url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ошибка загрузки');
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle_change(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {createElement(edit_pencil, {
        label,
        onClick: () => ref.current?.click(),
        className: `${size === 'sm' ? 'h-6 w-6' : 'h-9 w-9'} ${className}`,
      })}
    </>
  );
}

export function image_upload_button({
  on_pick,
  label = 'выбрать фото с компьютера',
  className = '',
}: {
  on_pick: (data_url: string) => void | Promise<void>;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  async function handle_change(file: File | undefined) {
    if (!file) return;
    try {
      const data_url = await read_image_file(file);
      await on_pick(data_url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ошибка загрузки');
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle_change(e.target.files?.[0]);
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
    </>
  );
}
