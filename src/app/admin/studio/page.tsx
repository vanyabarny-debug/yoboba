import { Suspense } from 'react';
import type { Metadata } from 'next';
import StudioEditor from '@/components/studio/studio-editor';

export const metadata: Metadata = {
  title: 'редактор · yomoyo',
};

export default function studio_page() {
  return (
    <Suspense fallback={<div className="h-dvh bg-[#eceae8]" />}>
      <StudioEditor />
    </Suspense>
  );
}
