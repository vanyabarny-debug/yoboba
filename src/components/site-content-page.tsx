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
  'bg-[#ecfdf5] text-accent',
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

  function parse_etymology_entry(text: string) {
    const numbered = text.match(/^(\d+)\.\s+([\s\S]+)$/);
    if (!numbered) return null;
    const [, , rest] = numbered;
    const [raw_title, ...lines] = rest.split('\n');
    const title = raw_title.trim();
    let meta = '';
    let reading = '';
    let sense = '';
    let kanji = '';
    const body: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('meta:')) meta = trimmed.slice(5).trim();
      else if (trimmed.startsWith('reading:')) reading = trimmed.slice(8).trim();
      else if (trimmed.startsWith('sense:')) sense = trimmed.slice(6).trim();
      else if (trimmed.startsWith('kanji:')) kanji = trimmed.slice(6).trim();
      else if (trimmed) body.push(trimmed);
    }
    return { title, meta, reading, sense, kanji, body: body.join(' ') };
  }

  function render_etymology_entry(text: string, index: number) {
    const entry = parse_etymology_entry(text);
    if (!entry) return null;
    const accents = [
      { panel: 'from-[#eef4ff] to-white', mark: 'text-accent' },
      { panel: 'from-[#e8f7f0] to-white', mark: 'text-[#0f7a4c]' },
    ];
    const tint = accents[index % accents.length];
    return (
      <article
        key={entry.title}
        className={`relative overflow-hidden rounded-[2px] border border-neutral-200/90 bg-gradient-to-b ${tint.panel} p-5 sm:p-6`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent/30"
          aria-hidden
        />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-500">
              {entry.meta || 'морфема'}
            </p>
            <div className="mt-3 flex items-end gap-3">
              <h3 className={`font-display text-5xl sm:text-6xl font-bold leading-none ${tint.mark}`}>
                {entry.title}
              </h3>
              {entry.kanji ? (
                <span className="pb-1 font-display text-3xl sm:text-4xl font-bold leading-none text-neutral-900/80">
                  {entry.kanji}
                </span>
              ) : null}
            </div>
          </div>
          <span className="font-display text-sm font-bold tabular-nums text-neutral-400">
            §{String(index + 1).padStart(2, '0')}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-dashed border-neutral-300/80 pt-4 text-sm">
          {entry.reading ? (
            <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-baseline">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                чтение
              </dt>
              <dd className="font-medium text-neutral-800">{entry.reading}</dd>
            </div>
          ) : null}
          {entry.sense ? (
            <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-baseline">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                значение
              </dt>
              <dd className="font-medium text-neutral-800">{entry.sense}</dd>
            </div>
          ) : null}
        </dl>

        {entry.body ? (
          <p className="mt-4 text-[15px] font-medium leading-relaxed text-neutral-700">
            {entry.body}
          </p>
        ) : null}
      </article>
    );
  }

  function render_etymology_section(section: content_section) {
    const [lead, ...notes] = section.prose;
    return (
      <section
        key={section.title}
        className="relative mt-14 overflow-hidden rounded-[28px] border border-neutral-200 bg-[#f7f9fc] px-5 py-8 sm:px-8 sm:py-10"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(0,57,166,0.06) 28px)',
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-accent">
            этимология · морфология · смысл
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-5xl font-bold leading-[0.98] text-neutral-900">
            {section.title}
          </h2>

          <div className="mt-7 rounded-[2px] border border-neutral-300/80 bg-white/90 p-5 sm:p-6">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <span className="font-display text-4xl sm:text-5xl font-bold leading-none text-neutral-900">
                yomoyo
              </span>
              <span className="pb-1 font-mono text-sm text-neutral-500">/joˈmojo/</span>
            </div>
            <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.18em] text-neutral-500">
              имя бренда · сложное слово · yo + moyo
            </p>
            {lead ? (
              <p className="mt-4 max-w-3xl text-[16px] font-medium leading-relaxed text-neutral-800">
                {lead}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-bold text-neutral-700">
            <span className="border border-neutral-300 bg-white px-3 py-1.5">yo</span>
            <span className="text-neutral-400">+</span>
            <span className="border border-neutral-300 bg-white px-3 py-1.5">moyo</span>
            <span className="text-neutral-400">→</span>
            <span className="bg-accent px-3 py-1.5 text-white">yomoyo</span>
          </div>

          {notes.length > 0 ? (
            <div className="mt-5 max-w-3xl space-y-3 text-[15px] font-medium leading-relaxed text-neutral-700">
              {notes.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {section.cards.map((block, index) => render_etymology_entry(block, index))}
          </div>
        </div>
      </section>
    );
  }

  function render_cards_body(
    section: content_section,
    variant: 'cards' | 'list' | 'lang' | 'etymology',
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
    options?: {
      variant?: 'cards' | 'list' | 'lang' | 'etymology';
      compact?: boolean;
      columns?: string;
    }
  ) {
    const {
      variant = 'cards',
      compact = false,
      columns = 'sm:grid-cols-2 xl:grid-cols-3',
    } = options ?? {};
    if (variant === 'etymology') return render_etymology_section(section);
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

  function section_variant(title: string): 'cards' | 'list' | 'lang' | 'etymology' {
    if (title === 'почему yomoyo?') return 'etymology';
    if (title === 'что мы готовим и как') return 'list';
    return 'cards';
  }

  return with_chrome(
    <div className="page-shell py-8 sm:py-10 pb-16">
      <section className="grid gap-6">
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
