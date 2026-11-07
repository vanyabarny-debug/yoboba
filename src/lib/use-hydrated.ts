'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** false на сервере и при гидрации, true после — чтобы читать localStorage без рассинхрона */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
