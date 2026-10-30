'use client';

import Link from 'next/link';
import Topbar from '@/components/study/topbar';

export default function study_page() {
  return (
    <div className="shell">
      <Topbar title="заявка" />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div className="w-full max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">yo study</p>
          <h1 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">куда ты?</h1>
          <div className="mt-8 flex flex-col gap-3 text-left">
            <Link
              href="/study/barista"
              className="rounded-3xl border border-neutral-200 px-5 py-4 transition-colors hover:border-neutral-900"
            >
              <span className="block text-lg font-semibold">бариста</span>
              <span className="mt-1 block text-sm font-medium text-neutral-500">
                смены, стажировка и короткое обучение
              </span>
            </Link>
            <Link
              href="/study/creator"
              className="rounded-3xl border border-neutral-200 px-5 py-4 transition-colors hover:border-neutral-900"
            >
              <span className="block text-lg font-semibold">контент-креатор</span>
              <span className="mt-1 block text-sm font-medium text-neutral-500">
                до 5 напитков в неделю за контент. прикрепи лучшие работы
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
