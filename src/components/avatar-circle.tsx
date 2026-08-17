'use client';

import { avatar_circle_style, avatar_emoji_from_id } from '@/lib/avatar-emoji';

type props = {
  emoji?: string | null;
  bg?: string | null;
  image_url?: string | null;
  user_id?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const size_cls = {
  sm: 'h-11 w-11 text-[22px]',
  md: 'h-14 w-14 text-3xl',
  lg: 'h-16 w-16 text-[2rem]',
} as const;

/** кружок аватарки — фото VK, иначе эмоджи */
export default function avatar_circle({
  emoji,
  bg,
  image_url,
  user_id,
  size = 'sm',
  className = '',
}: props) {
  const photo = image_url?.trim() || '';
  const face = emoji || (user_id ? avatar_emoji_from_id(user_id) : '🧋');
  const paint = avatar_circle_style(bg);

  if (photo) {
    return (
      <span
        className={`inline-flex shrink-0 overflow-hidden rounded-full ${size_cls[size]} ${className}`}
        aria-hidden
      >
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

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
