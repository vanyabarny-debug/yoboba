'use client';

import { createElement } from 'react';

/** бренд: «копи бобаллы» — ударение смысловое на бО */
export function kopi_boby_name({ className = '' }: { className?: string }) {
  return createElement(
    'span',
    { className },
    createElement(
      'span',
      { className: 'whitespace-nowrap' },
      'копи ',
      createElement(
        'u',
        { className: 'underline-offset-[3px] decoration-2' },
        'бО'
      ),
      'баллы'
    )
  );
}

export default kopi_boby_name;
