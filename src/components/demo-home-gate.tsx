'use client';

import { createElement, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HomeClient from '@/components/home-client';
import { get_demo_user } from '@/lib/demo-auth';
import { get_location } from '@/lib/location';
import { useHydrated } from '@/lib/use-hydrated';
import type { menu_item, story } from '@/lib/types';

type props = {
  initial_menu: menu_item[];
  initial_stories: story[];
};

export default function DemoHomeGate({ initial_menu, initial_stories }: props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [checked, set_checked] = useState(false);
  const [user, set_user] = useState<ReturnType<typeof get_demo_user>>(null);
  if (hydrated && !checked) {
    set_checked(true);
    set_user(get_location() ? get_demo_user() : null);
  }

  useEffect(() => {
    if (checked && !user) router.replace('/login');
  }, [checked, user, router]);

  if (!user) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-sm text-neutral-500">загрузка...</p>
      </div>
    );
  }

  return createElement(HomeClient, {
    initial_menu,
    initial_stories,
    demo_mode: true,
  });
}
