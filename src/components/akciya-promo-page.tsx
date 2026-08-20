'use client';

import { createElement, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import site_chrome from '@/components/site-chrome';
import {
  get_default_page_by_slug,
  get_page_by_slug,
  subscribe_site_content_store,
  type site_page,
} from '@/lib/site-content-store';

type props = {
  slug: string;
  hero_src: string;
  eyebrow?: string;
  primary_cta?: { href: string; label: string };
  hero_bg?: string;
};

type section = {
  title: string;
  prose: string[];
  cards: { title: string; body: string }[];
};

function split_blocks(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function plain_text(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^##\s+/, '')
    .trim();
}

function parse_body(body: string): { intro: string[]; sections: section[] } {
  const text = body.trim();
  const starts_with_heading = /^##\s+/.test(text);
  const chunks = text.split(/(?:^|\n)##\s+/);
  const intro_raw = starts_with_heading ? '' : chunks[0] || '';
  const section_chunks = starts_with_heading
    ? chunks.filter((c) => c.trim())
    : chunks.slice(1);

  const intro = split_blocks(intro_raw).map(plain_text);
  const sections = section_chunks.map((part) => {
    const [title_line, ...rest] = part.split('\n');
    const blocks = split_blocks(rest.join('\n')).map(plain_text);
    return {
      title: plain_text(title_line || ''),
      prose: blocks.filter((block) => !/^\d+\.\s/.test(block)),
      cards: blocks
        .filter((block) => /^\d+\.\s/.test(block))
        .map((block) => {
          const match = block.match(/^(\d+)\.\s+([\s\S]+)$/);
          if (!match) return { title: block, body: '' };
          const [, , rest_text] = match;
          const [title, ...body_parts] = rest_text.split('\n');
          return { title: title.trim(), body: body_parts.join('\n').trim() };
        }),
    };
  });
  return { intro, sections };
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 text-accent break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={`${part.slice(0, 24)}-${index}`}>{part}</span>;
  });
}

export default function akciya_promo_page({
  slug,
  hero_src,
  eyebrow = 'акция',
  primary_cta = { href: '/', label: 'в меню' },
  hero_bg = '#0141C7',
}: props) {
  // дефолты из кода — одинаковые на сервере и клиенте (без localStorage)
  const [page, set_page] = useState<site_page | null>(
    () => get_default_page_by_slug(slug) ?? null
  );

  useEffect(() => {
    function reload() {
      set_page(get_page_by_slug(slug) ?? null);
    }
    reload();
    return subscribe_site_content_store(reload);
  }, [slug]);

  if (!page) {
    return createElement(
      Suspense,
      { fallback: <div className="min-h-screen bg-page" /> },
      createElement(
        site_chrome,
        null,
        <div className="page-shell py-12">
          <p className="text-neutral-500">страница не найдена</p>
        </div>
      )
    );
  }

  const { intro, sections } = parse_body(page.body);
  const primary_external = /^https?:\/\//.test(primary_cta.href);

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(
      site_chrome,
      null,
      <div className="page-shell py-8 sm:py-10 pb-16">
        <div
          className="mx-auto max-w-md overflow-hidden rounded-[28px]"
          style={{ backgroundColor: hero_bg }}
        >
          <img
            src={hero_src}
            alt=""
            className="block w-full object-contain aspect-[9/16]"
          />
        </div>

        <section className="mt-8 sm:mt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-heading-soft text-4xl sm:text-5xl lg:text-6xl font-bold leading-[0.98] text-neutral-900">
            {page.title}
          </h1>
          <div className="mt-6 max-w-3xl space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
            {intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{linkify(paragraph)}</p>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={primary_cta.href}
              {...(primary_external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className="rounded-pill bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground"
            >
              {primary_cta.label}
            </Link>
            <Link
              href="/akcii"
              className="rounded-pill border border-surface px-5 py-2.5 text-sm font-medium text-neutral-700"
            >
              все акции
            </Link>
          </div>
        </section>

        {sections.map((section) => (
          <section key={section.title} className="mt-12">
            <h2 className="font-heading-soft text-2xl sm:text-3xl font-bold text-neutral-900">
              {section.title}
            </h2>
            {section.prose.length > 0 && (
              <div className="mt-4 max-w-3xl space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
                {section.prose.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{linkify(paragraph)}</p>
                ))}
              </div>
            )}
            {section.cards.length > 0 && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {section.cards.map((card, index) => {
                  const tints = [
                    'bg-[#eef8ff] text-[#2274a5]',
                    'bg-[#fff4e8] text-[#d85c1f]',
                    'bg-[#ecfdf5] text-accent',
                    'bg-[#f5efff] text-[#7b4bd3]',
                  ];
                  const tint = tints[index % tints.length];
                  return (
                    <article
                      key={card.title}
                      className={`rounded-[28px] p-5 sm:p-6 shadow-[0_8px_28px_rgba(0,0,0,0.04)] ${tint}`}
                    >
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 font-display text-lg font-bold">
                        {index + 1}
                      </div>
                      <h3 className="font-display text-xl font-bold leading-tight">
                        {card.title}
                      </h3>
                      {card.body ? (
                        <p className="mt-3 text-[15px] font-medium leading-relaxed text-neutral-800">
                          {linkify(card.body)}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    )
  );
}
