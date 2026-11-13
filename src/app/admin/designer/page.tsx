import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminHeader } from '@/components/admin/admin-shell';
import { AdminSpotProvider } from '@/components/admin/admin-spot-context';
import StudioEditor from '@/components/studio/studio-editor';

export const metadata: Metadata = {
  title: 'дизайн · yomoyo',
};

export default function designer_page() {
  return (
    <AdminSpotProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-page">
        <AdminHeader wide />
        <Suspense fallback={<div className="min-h-0 flex-1 bg-[#eceae8]" />}>
          <StudioEditor embedded />
        </Suspense>
      </div>
    </AdminSpotProvider>
  );
}
