'use client';

import { createElement, Suspense, type MouseEvent } from 'react';
import Link from 'next/link';
import site_chrome from '@/components/site-chrome';

const VK_POST = 'https://vk.ru/wall-240740999_1';
const VK_COMMUNITY = 'https://vk.ru/yomoyo_kimry';

function vk_app_url(https_url: string) {
  const path = https_url.replace(/^https?:\/\/(www\.)?(m\.)?vk\.(ru|com)\//i, '');
  return { path, https_url };
}

/** на телефоне сразу пробуем приложение VK, иначе браузер */
function open_vk_in_app(https_url: string, event: MouseEvent<HTMLAnchorElement>) {
  const ua = navigator.userAgent || '';
  const is_android = /Android/i.test(ua);
  const is_ios = /iPhone|iPad|iPod/i.test(ua);
  if (!is_android && !is_ios) return;

  event.preventDefault();
  const { path } = vk_app_url(https_url);

  if (is_android) {
    window.location.href =
      `intent://${path}#Intent;scheme=https;authority=vk.ru;` +
      `package=com.vkontakte.android;` +
      `S.browser_fallback_url=${encodeURIComponent(https_url)};end`;
    return;
  }

  const started = Date.now();
  window.location.href = `vk://vk.ru/${path}`;
  window.setTimeout(() => {
    if (document.hidden || Date.now() - started > 2500) return;
    window.location.href = https_url;
  }, 700);
}

function vk_link({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => open_vk_in_app(href, event)}
    >
      {children}
    </a>
  );
}

const STEPS = [
  {
    n: '1',
    title: 'подпишись',
    text: 'на наше сообщество вконтакте',
  },
  {
    n: '2',
    title: 'поставь лайк',
    text: 'записи с акцией',
  },
  {
    n: '3',
    title: 'сделай репост',
    text: 'себе на стену и в историю',
  },
] as const;

const RULES = [
  '1 репост = 1 напиток = 1 рука',
  'напиток выбрать нельзя — на кассе скажут, какой идёт в подарок',
  'всего 100 бесплатных напитков: кто успел к открытию — тот и забрал',
] as const;

type props = {
  hero_src: string;
};

export default function akciya_100_page({ hero_src }: props) {
  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(
      site_chrome,
      null,
      <article className="page-shell py-6 sm:py-10 pb-20">
          <Link
            href="/akcii"
            className="inline-flex text-sm font-medium text-neutral-500 hover:text-neutral-800"
          >
            ← все акции
          </Link>

          <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-12">
            <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[24px] bg-[#0141C7] lg:mx-0 lg:max-w-none">
              <img
                src={hero_src}
                alt=""
                className="block w-full object-contain"
              />
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
                акция · 100 напитков
              </p>
              <h1 className="mt-3 font-heading-soft text-[2rem] sm:text-5xl font-bold leading-[1.05] text-neutral-900">
                бесплатно нальём
                <br className="hidden sm:block" /> самым быстрым
              </h1>
              <p className="mt-4 max-w-xl text-[17px] font-medium leading-relaxed text-neutral-700">
                сто первых гостей получают напиток бесплатно. чтобы участвовать —
                зайди в пост вк и сделай три шага ниже.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {vk_link({
                  href: VK_POST,
                  className:
                    'rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground',
                  children: 'открыть пост в vk',
                })}
                {vk_link({
                  href: VK_COMMUNITY,
                  className:
                    'rounded-pill border border-surface px-6 py-3 text-sm font-medium text-neutral-700',
                  children: 'сообщество vk',
                })}
                <Link
                  href="/"
                  className="rounded-pill border border-surface px-6 py-3 text-sm font-medium text-neutral-700"
                >
                  в меню
                </Link>
              </div>
            </div>
          </div>

          <section className="mt-12 sm:mt-14 max-w-2xl">
            <h2 className="font-heading-soft text-2xl font-bold text-neutral-900">
              три шага
            </h2>
            <ol className="mt-6 space-y-0 divide-y divide-neutral-200/80 border-y border-neutral-200/80">
              {STEPS.map((step) => {
                const href = step.n === '1' ? VK_COMMUNITY : VK_POST;
                return (
                  <li key={step.n}>
                    {vk_link({
                      href,
                      className:
                        'flex gap-4 py-4 sm:gap-5 sm:py-5 hover:bg-white/60 transition-colors',
                      children: (
                        <>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                            {step.n}
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-[17px] font-bold leading-snug text-neutral-900">
                              {step.title}
                            </p>
                            <p className="mt-1 text-[15px] font-medium leading-relaxed text-neutral-600">
                              {step.text}
                            </p>
                          </div>
                        </>
                      ),
                    })}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="mt-12 max-w-2xl">
            <h2 className="font-heading-soft text-2xl font-bold text-neutral-900">
              правила
            </h2>
            <ul className="mt-5 space-y-3">
              {RULES.map((rule) => (
                <li
                  key={rule}
                  className="flex gap-3 text-[15px] font-medium leading-relaxed text-neutral-800"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <footer className="mt-16 max-w-2xl border-t border-neutral-200/80 pt-6 pb-4">
            <p className="text-[12px] font-semibold text-neutral-500">
              организатор и правила
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">
              организатор акции — yomoyo. подробности об организаторе, правилах
              проведения, количестве бесплатных напитков и времени проведения
              акции опубликованы на этой странице.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
              акция проводится до 01.09.2026. участие означает согласие с
              условиями выше. количество бесплатных напитков ограничено: 100 шт.
              yomoyo вправе завершить акцию досрочно при исчерпании лимита или
              по техническим причинам.
            </p>
          </footer>
        </article>
    )
  );
}
