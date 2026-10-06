'use client';

import { useEffect, useState } from 'react';
import DayTasksManage from '@/components/admin/day-tasks-manage';
import ShiftChecklistControl from '@/components/admin/shift-checklist-control';
import ShiftChecklistsManage from '@/components/admin/shift-checklists-manage';

type panel_tab = 'checklists' | 'timed' | 'control';

export default function personnel_tasks_panel() {
  const [tab, set_tab] = useState<panel_tab>('checklists');
  const [control, set_control] = useState<{
    progress: { opening: []; closing: [] };
    checklist_proofs: [];
    timed_proofs: [];
  } | null>(null);

  useEffect(() => {
    if (tab !== 'control') return;
    void (async () => {
      const res = await fetch('/api/admin/shift-checklists', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      set_control({
        progress: {
          opening: data.progress?.opening || [],
          closing: data.progress?.closing || [],
        },
        checklist_proofs: data.checklist_proofs,
        timed_proofs: data.timed_proofs,
      });
    })();
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-surface bg-white p-1">
        <button
          type="button"
          onClick={() => set_tab('checklists')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === 'checklists' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          чек-листы
        </button>
        <button
          type="button"
          onClick={() => set_tab('timed')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === 'timed' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          задачи в течение дня
        </button>
        <button
          type="button"
          onClick={() => set_tab('control')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === 'control' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          контроль
        </button>
      </div>
      {tab === 'checklists' ? <ShiftChecklistsManage /> : null}
      {tab === 'timed' ? <DayTasksManage /> : null}
      {tab === 'control' && control ? (
        <ShiftChecklistControl
          progress={control.progress}
          checklist_proofs={control.checklist_proofs}
          timed_proofs={control.timed_proofs}
        />
      ) : null}
      {tab === 'control' && !control ? (
        <p className="py-8 text-center text-sm text-neutral-400">загрузка...</p>
      ) : null}
    </div>
  );
}
