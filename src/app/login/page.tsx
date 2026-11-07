import { Suspense, createElement } from 'react';
import LoginClient from './login-client';

export default function login_page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-page flex items-center justify-center">
          <p className="text-sm text-neutral-500">загрузка...</p>
        </main>
      }
    >
      {createElement(LoginClient)}
    </Suspense>
  );
}
