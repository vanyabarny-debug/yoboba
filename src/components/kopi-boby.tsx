'use client';

import { createElement } from 'react';

/** бренд баллов: ко́пи бобы — ударение на первый слог */
export function kopi_boby_name({
  className = '',
  with_hint = false,
}: {
  className?: string;
  with_hint?: boolean;
}) {
  return createElement(
    'span',
    { className },
    createElement(
      'span',
      { className: 'whitespace-nowrap' },
      createElement(
        'u',
        { className: 'underline-offset-[3px] decoration-2' },
        'ко\u0301'
      ),
      'пи бобы'
    ),
    with_hint
      ? createElement(
          'span',
          { className: 'ml-1.5 text-[0.7em] font-normal opacity-70' },
          'ударение на КО'
        )
      : null
  );
}

export default kopi_boby_name;
