'use client';

import { avatar_circle_style, avatar_emoji_from_id } from '@/lib/avatar-emoji';

type props = {
  emoji?: string | null;
  bg?: string | null;
  user_id?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const size_cls = {
  sm: 'h-11 w-11 text-[22px]',
  md: 'h-14 w-14 text-3xl',
  lg: 'h-16 w-16 text-[2rem]',
} as const;

/** кружок аватарки — один стиль в шапке и в профиле */
export default function avatar_circle({
  emoji,
  bg,
  user_id,
  size = 'sm',
  className = '',
}: props) {
  const face = emoji || (user_id ? avatar_emoji_from_id(user_id) : '🧋');
  const paint = avatar_circle_style(bg);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${size_cls[size]} ${paint.className} ${className}`}
      style={paint.style}
      aria-hidden
    >
      {face}
    </span>
  );
}
