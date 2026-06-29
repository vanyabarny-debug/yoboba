'use client';

type props = {
  city: string;
  user_name?: string | null;
  bonus?: number;
  is_logged_in: boolean;
  show_admin?: boolean;
  on_home?: () => void;
  on_city_click?: () => void;
  on_login?: () => void;
  on_logout?: () => void;
  on_admin?: () => void;
};

export default function site_header({
  city,
  user_name,
  bonus = 0,
  is_logged_in,
  show_admin = false,
  on_home,
  on_city_click,
  on_login,
  on_logout,
  on_admin,
}: props) {
  return (
    <div className="bg-page">
      <div className="page-shell py-3 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
          <button
            type="button"
            onClick={on_home}
            className="flex-shrink-0 flex flex-col items-start text-left hover:opacity-90 transition-opacity"
            aria-label="yoboba — на главную, все меню"
          >
            <span className="font-display text-[32px] sm:text-[38px] font-bold tracking-tight leading-none text-accent">
              yoboba
            </span>
            <span className="text-[12px] sm:text-[13px] text-neutral-600 font-semibold tracking-normal mt-3 leading-tight">
              первая баблтишная<br />в городе Кимры
            </span>
          </button>

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
              className="inline-flex items-center justify-center text-center rounded-pill bg-[#cfe8ff] px-4 sm:px-6 py-2.5 text-sm font-bold text-[#1b6391] hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              войти
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
