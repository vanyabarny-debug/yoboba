'use client';

import { day_task_media_url } from '@/lib/day-task-templates';

type task_progress = {
  id: string;
  seller_name: string | null;
  spot_address: string | null;
  percent: number;
  checked: number;
  total: number;
  completed_at: string | null;
};

type checklist_proof = {
  id: string;
  kind: 'opening' | 'day' | 'closing';
  seller_id: string;
  item_id: string;
  media: { id: string; kind: 'image' | 'video' };
};

const kind_label = {
  opening: 'открытие',
  day: 'день',
  closing: 'закрытие',
} as const;

function progress_block(title: string, rows: task_progress[]) {
  return (
    <div className="rounded-xl border border-surface bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {!rows.length ? (
        <p className="mt-2 text-sm text-neutral-400">сегодня ещё не начинали</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-surface px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.seller_name || 'бариста'}</span>
                <span className="tabular-nums text-neutral-500">
                  {row.checked}/{row.total} · {row.percent}%
                </span>
              </div>
              {row.spot_address ? <p className="text-xs text-neutral-400">{row.spot_address}</p> : null}
              {row.completed_at ? (
                <p className="mt-1 text-xs text-green-600">
                  закрыто{' '}
                  {new Date(row.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              ) : null}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-accent" style={{ width: `${row.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function shift_checklist_control({
  progress,
  checklist_proofs,
  timed_proofs,
}: {
  progress: { opening: task_progress[]; day: task_progress[]; closing: task_progress[] };
  checklist_proofs: checklist_proof[];
  timed_proofs: { id: string; template_id: string; seller_id: string; media: { id: string; kind: 'image' | 'video' } }[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">контроль смены</h2>
        <p className="text-sm text-neutral-500">прогресс чек-листов и файлы от бариста за сегодня</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {progress_block('открытие', progress.opening)}
        {progress_block('в течение дня', progress.day)}
        {progress_block('закрытие', progress.closing)}
      </div>
      {checklist_proofs.length ? (
        <div className="rounded-xl border border-surface bg-white p-4">
          <h3 className="text-sm font-semibold">отчёты по пунктам чек-листа</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {checklist_proofs.map((shot) =>
              shot.media.kind === 'image' ? (
                <a key={shot.id} href={day_task_media_url(shot.media.id)} target="_blank" rel="noreferrer">
                  <img src={day_task_media_url(shot.media.id)} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  <p className="mt-1 text-center text-[10px] text-neutral-400">{kind_label[shot.kind]}</p>
                </a>
              ) : (
                <a key={shot.id} href={day_task_media_url(shot.media.id)} target="_blank" rel="noreferrer">
                  <video src={day_task_media_url(shot.media.id)} className="h-20 w-20 rounded-lg object-cover" />
                  <p className="mt-1 text-center text-[10px] text-neutral-400">{kind_label[shot.kind]}</p>
                </a>
              )
            )}
          </div>
        </div>
      ) : null}
      {timed_proofs.length ? (
        <div className="rounded-xl border border-surface bg-white p-4">
          <h3 className="text-sm font-semibold">отчёты по задачам по расписанию</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {timed_proofs.map((shot) =>
              shot.media.kind === 'image' ? (
                <img key={shot.id} src={day_task_media_url(shot.media.id)} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <video key={shot.id} src={day_task_media_url(shot.media.id)} className="h-20 w-20 rounded-lg object-cover" />
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
