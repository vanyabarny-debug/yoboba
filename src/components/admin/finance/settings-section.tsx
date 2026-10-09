'use client';

import { useRef, useState } from 'react';
import {
  default_finance_state,
  is_bubble_manager_backup,
  normalize_finance_state,
  sync_tech_cards_with_menu,
  type finance_state,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { Card, btn_ghost_danger, btn_primary, btn_secondary, chip_active, chip_idle } from '@/components/admin/finance/ui';

function merge_states(current: finance_state, incoming: finance_state): finance_state {
  const by_id = <T extends { id: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b) map.set(x.id, x);
    return [...map.values()];
  };
  const months = new Map(current.monthsData.map((m) => [m.month, m]));
  for (const m of incoming.monthsData) months.set(m.month, m);
  return {
    ...current,
    materials: by_id(current.materials, incoming.materials),
    techCards: by_id(current.techCards, incoming.techCards),
    opexCategories: by_id(current.opexCategories, incoming.opexCategories),
    equipments: by_id(current.equipments, incoming.equipments),
    monthsData: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    stockMovements: by_id(current.stockMovements, incoming.stockMovements),
  };
}

export default function SettingsSection({ state, set_state, menu }: section_props) {
  const file_ref = useRef<HTMLInputElement>(null);
  const [message, set_message] = useState('');
  const [mode, set_mode] = useState<'merge' | 'replace'>('merge');
  const [cloud_msg, set_cloud_msg] = useState('');
  const [cloud_busy, set_cloud_busy] = useState(false);

  async function migrate_cloud() {
    set_cloud_busy(true);
    set_cloud_msg('');
    try {
      const res = await fetch('/api/admin/finance/cloud', { method: 'POST', credentials: 'same-origin' });
      const body = (await res.json()) as {
        finance_state?: boolean;
        stock_audit?: boolean;
        copied?: string[];
        audit_copied?: number;
        error?: string;
      };
      if (!res.ok) {
        set_cloud_msg(body.error || 'не удалось проверить облако');
        return;
      }
      if (!body.finance_state) {
        set_cloud_msg(
          body.error ||
            'таблицы ещё нет: в supabase SQL Editor выполни файл supabase/finance-cloud.sql, потом нажми сюда снова'
        );
        return;
      }
      const bits = [
        'finance_state есть',
        body.stock_audit ? 'stock_audit есть' : 'stock_audit нет',
        body.copied?.length ? `перенесено: ${body.copied.join(', ')}` : 'строки уже были на месте',
        body.audit_copied ? `история склада: ${body.audit_copied}` : '',
      ].filter(Boolean);
      set_cloud_msg(bits.join(' · '));
    } catch {
      set_cloud_msg('не удалось связаться с сервером');
    } finally {
      set_cloud_busy(false);
    }
  }

  function export_json() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yosquad_finance_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function import_file(file: File) {
    set_message('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!is_bubble_manager_backup(parsed)) {
        set_message('файл не похож на бэкап bubble manager / финансов (нужны materials, techCards, monthsData)');
        return;
      }
      const incoming = normalize_finance_state(parsed);
      set_state((prev) => {
        const merged = mode === 'replace' ? incoming : merge_states(prev, incoming);
        return sync_tech_cards_with_menu(merged, menu);
      });
      set_message(
        `импортировано: ${incoming.materials.length} материалов, ${incoming.techCards.length} техкарт, ${incoming.monthsData.length} месяцев${
          incoming.stockMovements.length ? `, ${incoming.stockMovements.length} движений склада` : ''
        }. рецепты связаны с меню по названиям — проверьте в разделе «меню».`
      );
    } catch {
      set_message('не удалось прочитать файл');
    } finally {
      if (file_ref.current) file_ref.current.value = '';
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="перенос из старого bubble manager" hint="откройте bubble manager → настройки → «выгрузить в .json», затем загрузите файл сюда. меню сайта не затрётся">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {(
            [
              ['merge', 'дополнить текущие данные'],
              ['replace', 'заменить всё файлом'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => set_mode(id)}
              className={mode === id ? chip_active : `${chip_idle} border border-neutral-200`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          ref={file_ref}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void import_file(f);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn_primary} onClick={() => file_ref.current?.click()}>
            загрузить .json
          </button>
          <button type="button" className={btn_secondary} onClick={export_json}>
            скачать резервную копию
          </button>
        </div>
        {message && <p className="mt-3 rounded-2xl bg-accent/5 px-3 py-2 text-xs text-neutral-700">{message}</p>}
        <p className="mt-3 text-xs font-normal text-neutral-400">формат тот же: файл можно открыть и в старом bubble manager.</p>
      </Card>

      <Card
        title="облако supabase"
        hint="склад, касса и выдачи должны жить в таблицах finance_state / stock_audit. меню (menu_catalog / main) не трогаем"
      >
        <button type="button" className={btn_primary} disabled={cloud_busy} onClick={() => void migrate_cloud()}>
          {cloud_busy ? 'проверяю…' : 'перенести / проверить облако'}
        </button>
        {cloud_msg ? <p className="mt-3 rounded-2xl bg-accent/5 px-3 py-2 text-xs text-neutral-700">{cloud_msg}</p> : null}
        <p className="mt-3 text-xs font-normal text-neutral-400">
          если таблиц ещё нет — один раз выполни <code>supabase/finance-cloud.sql</code> в SQL Editor, затем кнопку ещё раз.
        </p>
      </Card>

      <Card title="меню и техкарты" hint="позиции меню сайта автоматически получают техкарту; здесь можно пересинхронизировать">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn_secondary} onClick={() => set_state((p) => sync_tech_cards_with_menu(p, menu))}>
            синхронизировать с меню
          </button>
          <span className="text-xs text-neutral-500">
            {state.techCards.filter((c) => c.menu_item_id).length} из {state.techCards.length} техкарт связаны · {menu.length} позиций в меню
          </span>
        </div>
      </Card>

      <Card title="опасная зона">
        <button
          type="button"
          className={btn_ghost_danger}
          onClick={() => {
            if (!window.confirm('сбросить все финансовые данные к заводским? меню сайта не пострадает. это нельзя отменить.')) return;
            if (!window.confirm('точно? сначала скачайте резервную копию.')) return;
            set_state(() => sync_tech_cards_with_menu(default_finance_state(), menu));
          }}
        >
          сбросить финансы к заводским
        </button>
      </Card>
    </div>
  );
}
