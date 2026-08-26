'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, createElement } from 'react';
import type { promo_banner } from '@/lib/types';
import edit_pencil from '@/components/admin/edit-pencil';
import promo_title_on_image from '@/components/promo-title-on-image';

type props = {
  promos: promo_banner[];
  on_promo_click: (promo: promo_banner) => void;
  edit_mode?: boolean;
  on_edit_promo?: (promo: promo_banner) => void;
  on_add_promo?: () => void;
  /** home: кружки на мобилке, карточки на пк; cards: карточки везде (страница «все акции») */
  layout?: 'home' | 'cards';
};

// пауза между автолистаниями (по одной карточке)
const AUTOPLAY_DELAY = 3500;

export default function promo_banners({
  promos,
  on_promo_click,
  edit_mode = false,
  on_edit_promo,
  on_add_promo,
  layout = 'home',
}: props) {
  const active = edit_mode ? promos : promos.filter((p) => p.is_active);
  const show_stories = layout === 'home';
  const show_cards = layout === 'cards';

  const scroll_ref = useRef<HTMLDivElement>(null);
  const track_ref = useRef<HTMLDivElement>(null);
  const wrap_ref = useRef<HTMLDivElement>(null);
  const [can_left, set_can_left] = useState(false);
  const [can_right, set_can_right] = useState(() => active.length > 3);

  const update_arrows = useCallback(() => {
    const el = scroll_ref.current;
    const track = track_ref.current;
    if (!el) return;

    const overflow_by_scroll = el.scrollWidth - el.clientWidth > 4;
    const overflow_by_layout =
      track !== null &&
      track.getBoundingClientRect().right > el.getBoundingClientRect().right + 1;

    const has_overflow = overflow_by_scroll || overflow_by_layout;

    set_can_left(el.scrollLeft > 4);
    set_can_right(
      has_overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    );
  }, []);

  useLayoutEffect(() => {
    if (!show_cards) return;

    update_arrows();
    const el = scroll_ref.current;
    const track = track_ref.current;
    const wrap = wrap_ref.current;
    if (!el) return;

    el.addEventListener('scroll', update_arrows, { passive: true });
    window.addEventListener('resize', update_arrows);

    const ro = new ResizeObserver(update_arrows);
    ro.observe(el);
    if (track) ro.observe(track);
    if (wrap) ro.observe(wrap);

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update_arrows);
    };

    schedule();
    const raf2 = requestAnimationFrame(schedule);

    document.fonts?.ready.then(update_arrows);
    document.fonts?.addEventListener?.('loadingdone', update_arrows);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      el.removeEventListener('scroll', update_arrows);
      window.removeEventListener('resize', update_arrows);
      document.fonts?.removeEventListener?.('loadingdone', update_arrows);
      ro.disconnect();
    };
  }, [active.length, show_cards, update_arrows]);

  function first_visible_index(cards: HTMLElement[], container: HTMLDivElement) {
    const cr = container.getBoundingClientRect();
    for (let i = 0; i < cards.length; i++) {
      const tr = cards[i].getBoundingClientRect();
      if (tr.right > cr.left + 1) return i;
    }
    return 0;
  }

  function scroll_to_card(container: HTMLDivElement, card: HTMLElement) {
    const cr = container.getBoundingClientRect();
    const tr = card.getBoundingClientRect();
    const target = container.scrollLeft + (tr.left - cr.left);
    const max = container.scrollWidth - container.clientWidth;
    container.scrollTo({
      left: Math.max(0, Math.min(target, max)),
      behavior: 'smooth',
    });
  }

  const scroll_cards = useCallback((dir: -1 | 1) => {
    const el = scroll_ref.current;
    const track = track_ref.current;
    if (!el || !track) return;

    const cards = [...track.children] as HTMLElement[];
    if (cards.length === 0) return;

    const current = first_visible_index(cards, el);
    const next =
      dir === 1
        ? Math.min(current + 1, cards.length - 1)
        : Math.max(current - 1, 0);

    scroll_to_card(el, cards[next]);
  }, []);

  useEffect(() => {
    if (!show_cards || active.length <= 3) return;

    const el = scroll_ref.current;
    const wrap = wrap_ref.current;
    if (!el) return;

    let paused = false;
    const on_enter = () => {
      paused = true;
    };
    const on_leave = () => {
      paused = false;
    };
    wrap?.addEventListener('mouseenter', on_enter);
    wrap?.addEventListener('mouseleave', on_leave);

    const id = window.setInterval(() => {
      if (paused) return;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 4) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scroll_cards(1);
      }
    }, AUTOPLAY_DELAY);

    return () => {
      window.clearInterval(id);
      wrap?.removeEventListener('mouseenter', on_enter);
      wrap?.removeEventListener('mouseleave', on_leave);
    };
  }, [active.length, show_cards, scroll_cards]);

  if (!active.length && !edit_mode) return null;
  if (!active.length && edit_mode) {
    return (
      <section id="promos" className="mb-6 sm:mb-8 bg-page">
        <div className="page-shell">
          <button
            type="button"
            onClick={on_add_promo}
            className="rounded-card border border-dashed border-surface bg-white px-6 py-10 text-sm text-neutral-500 w-full"
          >
            + добавить акцию
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="promos" className="mb-4 min-[1024px]:mb-6 sm:mb-8 bg-page overflow-visible">
      {layout === 'home' && (
        <div className="page-shell pt-1 pb-1 sm:pt-2">
          <h2 className="text-xl sm:text-2xl font-extrabold leading-tight tracking-tight text-neutral-900">
            а у нас новости
          </h2>
        </div>
      )}
      {show_stories && (
        <div className="min-[1024px]:hidden w-full min-w-0">
          <div className="promo-stories-scroll stories-scroll">
            <div className="flex w-max gap-3 py-4 pl-[var(--page-gutter)]">
              {active.map((promo) => (
                  <div
                    key={promo.id}
                    className={`relative flex-shrink-0 ${
                      edit_mode && !promo.is_active ? 'opacity-45' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        edit_mode ? on_edit_promo?.(promo) : on_promo_click(promo)
                      }
                      className="flex w-[136px] flex-col items-center gap-2 text-center"
                    >
                      <span className="block size-[128px] overflow-hidden rounded-full bg-neutral-200 shadow-[0_0_0_3px_#f4f5f6,0_0_0_7px_#ff6b6b]">
                        <img
                          src={promo.image_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      </span>
                      <span className="w-full px-0.5 text-sm font-extrabold leading-snug text-neutral-900">
                        {promo.title.replace(/\n+/g, ' ')}
                      </span>
                    </button>
                    {edit_mode &&
                      on_edit_promo &&
                      createElement(edit_pencil, {
                        label: `править «${promo.title}»`,
                        onClick: () => on_edit_promo(promo),
                        className: 'absolute -top-1 -right-1 z-20',
                      })}
                  </div>
              ))}
              {edit_mode && on_add_promo && (
                <button
                  type="button"
                  onClick={on_add_promo}
                  className="flex w-[136px] flex-shrink-0 flex-col items-center gap-2 text-center"
                >
                  <span className="flex size-[128px] items-center justify-center rounded-full border-2 border-dashed border-surface bg-white text-2xl text-neutral-400">
                    +
                  </span>
                  <span className="w-full text-sm font-extrabold text-neutral-500">
                    акция
                  </span>
                </button>
              )}
              {/* хвостик, чтобы последний кружок можно было доскроллить; обрезка в покое — по правому краю экрана */}
              <div className="w-[var(--page-gutter)] flex-shrink-0" aria-hidden />
            </div>
          </div>
        </div>
      )}

      {/* карточки: пк на главной, везде на «все акции» */}
      <div
        ref={wrap_ref}
        className={`relative mx-auto w-full max-w-[var(--page-max)] overflow-visible ${
          show_cards ? 'block' : 'hidden min-[1024px]:block'
        }`}
      >
        {can_left && (
          <button
            type="button"
            onClick={() => scroll_cards(-1)}
            aria-label="прокрутить акции влево"
            className="absolute left-2 sm:left-4 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:text-neutral-950 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <div className="page-shell overflow-visible">
          <div ref={scroll_ref} className="overflow-x-auto stories-scroll min-w-0">
            <div ref={track_ref} className="flex w-max shrink-0 gap-2">
              {active.map((promo) => (
                <div
                  key={promo.id}
                  className={`relative flex-shrink-0 w-[152px] sm:w-[180px] aspect-[2/3] rounded-card overflow-hidden isolate ${
                    edit_mode && !promo.is_active ? 'opacity-45' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => (edit_mode ? on_edit_promo?.(promo) : on_promo_click(promo))}
                    className="relative block size-full bg-neutral-900 text-left hover:brightness-[1.03] transition-[filter,opacity]"
                    style={{
                      backgroundImage: `url("${promo.image_url}")`,
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    {!promo.title_in_image &&
                      createElement(promo_title_on_image, {
                        title: promo.title,
                        size: 'card',
                      })}
                  </button>
                  {edit_mode &&
                    on_edit_promo &&
                    createElement(edit_pencil, {
                      label: `править «${promo.title}»`,
                      onClick: () => on_edit_promo(promo),
                      className: 'absolute top-2 right-2 z-20',
                    })}
                </div>
              ))}
              {edit_mode && on_add_promo && (
                <button
                  type="button"
                  onClick={on_add_promo}
                  className="flex-shrink-0 w-[152px] sm:w-[180px] aspect-[2/3] rounded-card border border-dashed border-surface bg-white text-sm text-neutral-500"
                >
                  + акция
                </button>
              )}
            </div>
          </div>
        </div>

        {can_right && (
          <button
            type="button"
            onClick={() => scroll_cards(1)}
            aria-label="прокрутить акции вправо"
            className="absolute right-2 sm:right-4 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:text-neutral-950 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
