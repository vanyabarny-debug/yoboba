'use client';

import { createElement, useEffect, useState } from 'react';
import BrandWordmark from '@/components/brand-wordmark';
import profile_chip from '@/components/profile-chip';
import edit_pencil from '@/components/admin/edit-pencil';
import {
  get_brand_name,
  get_brand_settings,
  get_default_brand_settings,
  subscribe_brand_settings,
} from '@/lib/brand-store';

type props = {
  city: string;
  spot_address?: string;
  user_name?: string | null;
  bonus?: number;
  is_logged_in: boolean;
  show_admin?: boolean;
  edit_mode?: boolean;
  on_edit_logo?: () => void;
  on_edit_tagline?: () => void;
  on_home?: () => void;
  on_city_click?: () => void;
  on_login?: () => void;
  on_logout?: () => void;
  on_admin?: () => void;
};

export default function site_header({
  city,
  spot_address,
  user_name,
  bonus = 0,
  is_logged_in,
  show_admin = false,
  edit_mode = false,
  on_edit_logo,
  on_edit_tagline,
  on_home,
  on_city_click,
  on_login,
  on_logout,
  on_admin,
}: props) {
  const [brand, set_brand] = useState(() => get_default_brand_settings());

  useEffect(() => {
    function reload() {
      set_brand(get_brand_settings());
    }
    reload();
    return subscribe_brand_settings(reload);
  }, []);

  const brand_name = get_brand_name(brand);
  const address_label = spot_address || city;

  return (
    <div className="bg-page">
      {/* Mobile header — без логотипа: адрес + профиль */}
      <div className="page-shell py-3 flex items-center justify-between gap-2.5 min-[1024px]:hidden">
        <button
          type="button"
          onClick={on_city_click}
          className="group min-w-0 flex-1 text-left rounded-pill bg-neutral-300 px-4 py-2.5 hover:bg-neutral-400/90 transition-colors"
        >
          <p className="text-[15px] leading-snug font-semibold text-neutral-900 line-clamp-2">
            {address_label}
          </p>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {edit_mode ? (
            <span className="text-[10px] text-neutral-400">режим правки</span>
          ) : (
            createElement(profile_chip, {
              is_logged_in,
              bonus,
              user_name,
              on_login,
              on_logout,
            })
          )}
        </div>
      </div>

      {/* Desktop header */}
      <div className="page-shell py-3 sm:py-3.5 hidden min-[1024px]:flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={on_home}
              className="group m-0 inline-flex w-max max-w-full flex-col items-start justify-start gap-1 border-0 bg-transparent p-0 text-left hover:opacity-90 transition-opacity"
              aria-label={`${brand_name} — на главную, все меню`}
            >
              <BrandWordmark className="text-[32px] sm:text-[38px] leading-none" />
              <span className="block w-full text-left text-[12px] sm:text-[13px] font-medium leading-tight text-neutral-600">
                {brand.tagline.split('\n').map((line, i) => (
                  <span key={i} className="block text-left">
                    {line}
                  </span>
                ))}
              </span>
            </button>
            {edit_mode && on_edit_logo &&
              createElement(edit_pencil, {
                label: 'править логотип',
                onClick: on_edit_logo,
                className: 'absolute -right-1 top-0 h-6 w-6',
              })}
            {edit_mode && on_edit_tagline &&
              createElement(edit_pencil, {
                label: 'править слоган',
                onClick: on_edit_tagline,
                className: 'absolute -right-1 bottom-0 h-6 w-6',
              })}
          </div>

          <button
            type="button"
            onClick={on_city_click}
            className="group min-w-0 text-left border-l border-surface/80 pl-4 sm:pl-5 rounded-r-xl -my-1 py-1 pr-3 hover:bg-surface/60 transition-colors"
          >
            <p className="text-[16px] sm:text-[17px] leading-snug">
              заберу заказ в городе{' '}
              <span className="font-bold text-accent capitalize group-hover:underline decoration-2 underline-offset-2">
                {city}
              </span>
            </p>
            <p className="text-[12px] sm:text-[13px] text-neutral-500 mt-1 leading-relaxed group-hover:text-neutral-700 transition-colors">
              {is_logged_in
                ? `${user_name || 'гость'} · ${bonus} баллов`
                : 'нажмите, если город не ваш'}
            </p>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {show_admin && on_admin && (
            <button
              type="button"
              onClick={on_admin}
              className="hidden md:block text-xs text-neutral-500 px-2"
            >
              меню
            </button>
          )}
          {is_logged_in ? (
            <button
              type="button"
              onClick={on_logout}
              className="rounded-pill bg-menu px-4 sm:px-6 py-2.5 text-sm font-medium text-neutral-800 hover:bg-surface transition-colors whitespace-nowrap"
            >
              выйти
            </button>
          ) : (
            <button
              type="button"
              onClick={on_login}
              className="inline-flex items-center justify-center text-center rounded-pill bg-accent text-accent-foreground px-4 sm:px-6 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              войти
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
