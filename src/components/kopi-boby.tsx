'use client';

import { createElement } from 'react';

/**
 * бренд баллов: «копи бобабаллы»
 * «копи» = копить; ударение смысловое на бОба
 */
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
      'копи ',
      createElement(
        'u',
        { className: 'underline-offset-[3px] decoration-2' },
        'бО'
      ),
      'бабаллы'
    ),
    with_hint
      ? createElement(
          'span',
          { className: 'ml-1.5 text-[0.7em] font-normal opacity-70' },
          'шарики и баллы · коротко бб'
        )
      : null
  );
}

export default kopi_boby_name;
