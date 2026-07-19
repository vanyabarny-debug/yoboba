'use client';

/** аккуратно «пульсирует» цель (кнопку корзины) */
function pulse(el: HTMLElement) {
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16)' },
      { transform: 'scale(1)' },
    ],
    { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
  );
}

/** ищем видимую кнопку корзины (на десктопе — в навбаре, на мобиле — fab) */
function visible_cart_target(): HTMLElement | null {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>('[data-cart-target]')
  );
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Анимация «блюдо улетает в корзину».
 * source — элемент с картинкой блюда (клонируется).
 */
export function fly_to_cart(source: HTMLElement | null) {
  if (typeof window === 'undefined' || !source) return;

  const reduce = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const target = visible_cart_target();

  if (reduce) {
    if (target) pulse(target);
    return;
  }

  const src_rect = source.getBoundingClientRect();
  if (src_rect.width === 0) return;

  // цель: центр видимой корзины, либо низ-центр экрана (fallback)
  const tgt = target?.getBoundingClientRect();
  const tgt_x = tgt
    ? tgt.left + tgt.width / 2
    : window.innerWidth / 2;
  const tgt_y = tgt
    ? tgt.top + tgt.height / 2
    : window.innerHeight - 48;

  const clone = source.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${src_rect.left}px`,
    top: `${src_rect.top}px`,
    width: `${src_rect.width}px`,
    height: `${src_rect.height}px`,
    margin: '0',
    borderRadius: '18px',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '9999',
    boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
    willChange: 'transform, opacity',
  } as CSSStyleDeclaration);
  document.body.appendChild(clone);

  const dx = tgt_x - (src_rect.left + src_rect.width / 2);
  const dy = tgt_y - (src_rect.top + src_rect.height / 2);

  const anim = clone.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 56}px) scale(0.6)`,
        opacity: 0.95,
        offset: 0.55,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.14)`,
        opacity: 0.25,
      },
    ],
    { duration: 620, easing: 'cubic-bezier(0.55, -0.15, 0.75, 1)' }
  );

  const cleanup = () => clone.remove();
  anim.addEventListener('finish', () => {
    cleanup();
    if (target) pulse(target);
  });
  anim.addEventListener('cancel', cleanup);
}
