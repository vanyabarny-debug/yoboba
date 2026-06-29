'use client';

import type { story } from '@/lib/types';

type props = {
  stories: story[];
  on_story_click?: (story: story) => void;
};

export default function stories_strip({ stories, on_story_click }: props) {
  if (!stories.length) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-neutral-500 mb-3 px-1">сторис</h2>
      <div className="flex gap-3 overflow-x-auto stories-scroll pb-1 -mx-1 px-1">
        {stories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => on_story_click?.(item)}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 w-20"
          >
            <span className="block w-16 h-16 rounded-full ring-2 ring-accent ring-offset-2 ring-offset-page overflow-hidden bg-cream">
              <img
                src={item.image_url}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </span>
            <span className="text-xs text-neutral-600 truncate w-full text-center">
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
