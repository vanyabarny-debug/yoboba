'use client';

import { useEffect, useRef } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';

export default function auth_bootstrap() {
  const started = useRef(false);

  useEffect(() => {
    if (!is_supabase_configured() || started.current) return;
    started.current = true;

    const supabase = create_client();
    supabase.auth.getSession().catch(() => {});
  }, []);

  return null;
}
