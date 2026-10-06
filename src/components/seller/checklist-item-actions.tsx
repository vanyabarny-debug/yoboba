'use client';

import { day_task_media_url } from '@/lib/day-task-templates';

type media_ref = { id: string; kind: 'image' | 'video' };

export function ChecklistInstructionMedia({ media }: { media: media_ref }) {
  if (media.kind === 'image') {
    return (
      <img src={day_task_media_url(media.id)} alt="" className="mt-2 max-h-36 w-full rounded-xl object-contain" />
    );
  }
  return (
    <video src={day_task_media_url(media.id)} controls className="mt-2 max-h-36 w-full rounded-xl" />
  );
}

export function ChecklistProofPreview({ media }: { media: media_ref }) {
  if (media.kind === 'image') {
    return (
      <img
        src={day_task_media_url(media.id)}
        alt=""
        className="mt-2 h-20 w-20 rounded-lg object-cover"
      />
    );
  }
  return <video src={day_task_media_url(media.id)} className="mt-2 h-20 w-20 rounded-lg object-cover" controls />;
}
