'use client';

import { createElement, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import home_client from '@/components/home-client';
import { get_demo_user } from '@/lib/demo-auth';
import { get_location } from '@/lib/location';
import type { menu_item, story } from '@/lib/types';

type props = {
  initial_menu: menu_item[];
  initial_stories: story[];
};

export default function demo_home_gate({ initial_menu, initial_stories }: props) {
  const router = useRouter();
  const [ready, set_ready] = useState(false);
  const [user, set_user] = useState<ReturnType<typeof get_demo_user>>(null);

  useEffect(() => {
    if (!get_location()) {
      router.replace('/login');
      return;
    }
    const stored = get_demo_user();
    if (!stored) {
      router.replace('/login');
      return;
    }
    set_user(stored);
    set_ready(true);
  }, [router]);

  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-sm text-neutral-500">загрузка...</p>
      </div>
    );
  }

  return createElement(home_client, {
    initial_menu,
    initial_stories,
    demo_mode: true,
  });
}
