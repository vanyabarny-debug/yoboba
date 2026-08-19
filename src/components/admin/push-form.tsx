'use client';

import Link from 'next/link';

export default function push_form() {
  return (
    <div className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <h3 className="font-semibold mb-2">пуш-рассылка</h3>
      <p className="text-sm text-neutral-500 mb-3">
        разные тексты и выбор, кому отправить — во вкладке «пуши»
      </p>
      <Link
        href="/admin/push"
        className="inline-flex rounded-pill bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        открыть рассылку
      </Link>
    </div>
  );
}
