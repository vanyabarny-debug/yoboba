'use client';

import { createElement, Suspense, useEffect, useState, type ReactNode } from 'react';
import site_chrome from '@/components/site-chrome';
import {
  get_page_by_slug,
  subscribe_site_content_store,
  type site_page,
} from '@/lib/site-content-store';

type props = {
  slug: string;
  children?: React.ReactNode;
};

const card_tints = [
  'bg-[#fff1f6] text-accent',
  'bg-[#eef8ff] text-[#2274a5]',
  'bg-[#f4f8e8] text-[#5b7f1f]',
  'bg-[#fff4e8] text-[#d85c1f]',
  'bg-[#f5efff] text-[#7b4bd3]',
  'bg-[#eefaf4] text-[#138a55]',
];

type content_section = {
  title: string;
  prose: string[];
  cards: string[];
};

function split_blocks(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parse_body(body: string): { intro: string[]; sections: content_section[] } {
  const parts = body.split(/\n## /);
  const intro = split_blocks(parts[0]);
  const sections = parts.slice(1).map((part) => {
    const [title_line, ...rest] = part.split('\n');
    const blocks = split_blocks(rest.join('\n'));
    return {
      title: title_line.trim(),
      prose: blocks.filter((block) => !/^\d+\.\s/.test(block)),
      cards: blocks.filter((block) => /^\d+\.\s/.test(block)),
    };
  });
  return { intro, sections };
}

function with_chrome(content: ReactNode) {
  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(site_chrome, null, content)
  );
}

export default function site_content_page({ slug, children }: props) {
  const [page, set_page] = useState<site_page | null>(
    () => get_page_by_slug(slug) ?? null
  );

  useEffect(() => {
    function reload() {
      set_page(get_page_by_slug(slug) ?? null);
    }
    reload();
    return subscribe_site_content_store(reload);
  }, [slug]);

  if (!page) {
    return with_chrome(
      <div className="page-shell py-12">
        <p className="text-neutral-500">страница не найдена</p>
      </div>
    );
  }

  const { intro: intro_blocks, sections } = parse_body(page.body);

  function render_card(text: string, index: number, compact = false) {
    const numbered = text.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (!numbered) return null;
    const [, num, rest] = numbered;
    const [title, ...body_parts] = rest.split('\n');
    const tint = card_tints[index % card_tints.length];
    return (
      <article
        key={`${num}-${title}`}
        className={`rounded-[28px] p-5 sm:p-6 shadow-[0_8px_28px_rgba(0,0,0,0.04)] ${tint}`}
      >
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 font-display text-xl font-bold">
          {num}
        </div>
        <h3 className="font-display text-xl sm:text-2xl font-bold leading-tight">
          {title}
        </h3>
        {body_parts.length > 0 && (
          <p
            className={`mt-3 font-medium leading-relaxed text-neutral-800 ${
              compact ? 'text-sm' : 'text-[15px]'
            }`}
          >
            {body_parts.join('\n')}
          </p>
        )}
      </article>
    );
  }

  const is_about = slug === 'o-nas';

  const lang_meta: Record<string, { flag: string; label: string }> = {
    'на тайване': { flag: '🇹🇼', label: 'тайвань · 中文' },
    'в японии': { flag: '🇯🇵', label: 'япония · 日本語' },
    'в мире': { flag: '🌍', label: 'везде · street' },
  };

  function render_lang_card(text: string) {
    const numbered = text.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (!numbered) return null;
    const [, , rest] = numbered;
    const [raw_title, ...body_parts] = rest.split('\n');
    const title = raw_title.trim();
    const body = body_parts.join('\n').trim();
    const meta = lang_meta[title] ?? { flag: '🌐', label: title };
    const cjk = body.match(/[\u3040-\u30ff\u3400-\u9fff]+/);
    const quoted = body.match(/[«"„]([^»"”]+)[»"”]/);
    const glyph = cjk ? cjk[0] : quoted ? quoted[1] : 'yo';
    return (
      <article
        key={title}
        className="flex flex-col rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_8px_28px_rgba(0,0,0,0.04)]"
      >
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
          <span className="text-base leading-none">{meta.flag}</span>
          {meta.label}
        </span>
        <div className="mt-5 flex items-end gap-3">
          <span className="font-display text-5xl sm:text-6xl font-bold leading-none text-neutral-900">
            {glyph}
          </span>
          <span className="pb-1 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            yo
          </span>
        </div>
        <p className="mt-4 font-medium leading-relaxed text-neutral-700">{body}</p>
      </article>
    );
  }

  function render_list_row(text: string, index: number) {
    const numbered = text.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (!numbered) return null;
    const [, num, rest] = numbered;
    const [title, ...body_parts] = rest.split('\n');
    return (
      <div
        key={`${num}-${title}`}
        className="flex flex-col gap-1 py-6 sm:flex-row sm:gap-6"
      >
        <span className="font-display text-3xl sm:text-4xl font-bold leading-none text-accent/40 tabular-nums sm:w-16 sm:shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div>
          <h3 className="font-display text-xl sm:text-2xl font-bold leading-tight text-neutral-900">
            {title}
          </h3>
          {body_parts.length > 0 && (
            <p className="mt-2 max-w-2xl font-medium leading-relaxed text-neutral-700">
              {body_parts.join('\n')}
            </p>
          )}
        </div>
      </div>
    );
  }

  function render_cards_body(
    section: content_section,
    variant: 'cards' | 'list' | 'lang',
    compact: boolean,
    columns: string
  ) {
    if (section.cards.length === 0) return null;
    if (variant === 'list') {
      return (
        <div className="mt-6 divide-y divide-neutral-200/80 border-t border-neutral-200/80">
          {section.cards.map((block, card_index) => render_list_row(block, card_index))}
        </div>
      );
    }
    if (variant === 'lang') {
      return (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.cards.map((block) => render_lang_card(block))}
        </div>
      );
    }
    return (
      <div className={`mt-5 grid gap-4 ${columns}`}>
        {section.cards.map((block, card_index) => render_card(block, card_index, compact))}
      </div>
    );
  }

  function render_section(
    section: content_section,
    options?: { variant?: 'cards' | 'list' | 'lang'; compact?: boolean; columns?: string }
  ) {
    const {
      variant = 'cards',
      compact = false,
      columns = 'sm:grid-cols-2 xl:grid-cols-3',
    } = options ?? {};
    return (
      <section key={section.title} className="mt-12">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-neutral-900">
          {section.title}
        </h2>
        {section.prose.length > 0 && (
          <div className="mt-5 max-w-3xl space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
            {section.prose.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        )}
        {render_cards_body(section, variant, compact, columns)}
      </section>
    );
  }

  function section_variant(title: string): 'cards' | 'list' | 'lang' {
    if (title === 'что такое yoboba?') return 'lang';
    if (title === 'что мы готовим и как') return 'list';
    return 'cards';
  }

  return with_chrome(
    <div className="page-shell py-8 sm:py-10 pb-16">
      <section className="grid gap-6 min-[900px]:grid-cols-[1fr_0.95fr] min-[900px]:items-center">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[0.98] text-neutral-900">
            {page.title}
          </h1>
          <div className="mt-6 max-w-3xl space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
            {intro_blocks.slice(0, is_about ? 3 : 2).map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
          </div>
        </div>
        {is_about && (
          <div className="flex items-center justify-center">
            <img
              src="/images/about/hero.png"
              alt=""
              className="h-full max-h-[340px] w-full object-contain"
            />
          </div>
        )}
      </section>

      {is_about ? (
        <>
          <section className="mt-10 grid items-center gap-6 min-[900px]:grid-cols-[0.9fr_1.1fr]">
            <div className="flex items-center justify-center">
              <img
                src="/images/about/team.png"
                alt=""
                className="aspect-[4/3] w-full object-contain"
              />
            </div>
            <div className="space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
              {intro_blocks.slice(3).map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
          </section>

          {sections.map((section) =>
            render_section(section, {
              variant: section_variant(section.title),
              compact: section.title === 'ценности компании',
              columns:
                section.title === 'цели компании' ? 'lg:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3',
            })
          )}
        </>
      ) : (
        <section className="mt-2">
          <div className="max-w-5xl space-y-4 text-[16px] font-medium leading-relaxed text-neutral-800">
            {intro_blocks.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}
            {sections.map((section) => (
              <div key={section.title}>
                <h2 className="font-display text-2xl font-bold text-neutral-900">
                  {section.title}
                </h2>
                {section.prose.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)} className="mt-4">
                    {paragraph}
                  </p>
                ))}
                {section.cards.map((block) => {
                  const numbered = block.match(/^(\d+)\.\s+([\s\S]+)$/);
                  if (!numbered) return null;
                  const [, , rest] = numbered;
                  const [title, ...body_parts] = rest.split('\n');
                  return (
                    <div key={title} className="mt-4">
                      <h3 className="font-display text-lg font-bold">{title}</h3>
                      {body_parts.length > 0 && <p className="mt-1">{body_parts.join('\n')}</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {children}
    </div>
  );
}
