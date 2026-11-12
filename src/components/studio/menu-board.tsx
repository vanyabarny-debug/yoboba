'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  MENU_ACCENT,
  MENU_BLOCK_GAP,
  MENU_CARD,
  MENU_COL_GAP,
  MENU_EXTRA,
  MENU_INK,
  MENU_LOGO,
  MENU_MUTED,
  MENU_NOTE,
  MENU_PAD_B,
  MENU_PAD_L,
  MENU_PAD_R,
  MENU_PAD_T,
  MENU_SITE,
  MENU_SUGAR,
  MENU_TEXT_DEFAULTS,
  MENU_TOOLS_ID,
  arrange,
  block_label,
  clean_layout,
  empty_layout,
  load_saved_menu,
  load_seen,
  menu_big,
  menu_groups,
  menu_texts,
  merge_menu,
  move_block,
  move_item_local,
  place_item,
  sugar_key,
  type board_layout,
  type menu_block,
  type menu_card,
  type menu_group,
  type menu_paint,
  type menu_text_key,
  type menu_texts as menu_text_map,
} from '@/lib/studio/menu-layout';
import { item_categories, set_item_categories } from '@/lib/menu-item-categories';
import type { menu_store } from '@/lib/menu-store';
import type { studio_format } from '@/lib/studio/model';

type drag_payload =
  | { kind: 'item'; item_id: string; group_id: string; label: string }
  | { kind: 'block'; key: string; label: string };

type drop_target =
  | { kind: 'item'; group_id: string; before: string | null; line: line_box }
  | { kind: 'block'; col: 'left' | 'right'; before: string | null; line: line_box };

type line_box = { x: number; y: number; w: number };

const HOLD_MS = 320;
const no_subscribe = () => () => undefined;

export default function MenuBoard({
  format,
  paint_ref,
}: {
  format: studio_format;
  paint_ref: { current: menu_paint | null };
}) {
  const root_ref = useRef<HTMLDivElement>(null);
  const [store, set_store] = useState<menu_store | null>(null);
  const [saved, set_saved] = useState<unknown>(null);
  const [seen, set_seen] = useState<Set<string>>(() => new Set());
  const [layout, set_layout] = useState<board_layout>(empty_layout);
  const [failed, set_failed] = useState(false);
  const [qr, set_qr] = useState('');
  const [k, set_k] = useState(1);
  const [drag, set_drag] = useState<drag_payload | null>(null);
  const [drop, set_drop] = useState<drop_target | null>(null);
  const [ghost, set_ghost] = useState<{ x: number; y: number } | null>(null);
  const [toast, set_toast] = useState('');
  const [linked, set_linked] = useState(false);
  const [asking, set_asking] = useState(false);
  const tools = useSyncExternalStore(
    no_subscribe,
    () => document.getElementById(MENU_TOOLS_ID),
    () => null,
  );
  const drop_ref = useRef<drop_target | null>(null);
  const save_timer = useRef<number | undefined>(undefined);
  const toast_timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let live = true;
    Promise.all([
      load_saved_menu(),
      fetch('/api/menu').then((res) => (res.ok ? res.json() : Promise.reject(new Error('меню')))),
      fetch('/api/admin/menu-board', { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.json() : { layout: null }))
        .catch(() => ({ layout: null })),
    ])
      .then(([saved_groups, data, board]: [unknown, { store?: menu_store }, { layout?: unknown }]) => {
        if (!live) return;
        set_seen(load_seen());
        set_saved(saved_groups);
        set_store(data.store ?? null);
        set_layout(clean_layout(board.layout));
      })
      .catch(() => {
        if (live) set_failed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(MENU_SITE, {
      margin: 0,
      width: 512,
      color: { dark: '#20181B', light: '#FFFFFF' },
    })
      .then((url) => {
        if (live) set_qr(url);
      })
      .catch(() => {
        if (live) set_qr('');
      });
    return () => {
      live = false;
    };
  }, []);

  const groups = useMemo<menu_group[] | null>(
    () => (store ? merge_menu(saved, menu_groups(store), seen) : null),
    [store, saved, seen],
  );
  const columns = useMemo(() => (groups ? arrange(groups, layout) : { left: [], right: [], hidden: [] }), [groups, layout]);
  const texts = useMemo(() => menu_texts(layout), [layout]);

  useLayoutEffect(() => {
    const inner = document.getElementById('menu-sheet-fit');
    const box = document.getElementById('menu-sheet-body');
    if (!inner || !box || !groups?.length) return;
    let lo = 0.22;
    let hi = 1.15;
    let best = 0.22;
    for (let step = 0; step < 16; step += 1) {
      const mid = (lo + hi) / 2;
      inner.style.setProperty('--menu-k', String(mid));
      if (inner.scrollHeight <= box.clientHeight + 1) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    inner.style.setProperty('--menu-k', String(best));
    set_k(Number(best.toFixed(3)));
  }, [columns, groups, texts, format.w, format.h]);

  paint_ref.current = { k, left: columns.left, right: columns.right, qr, texts };

  const say = useCallback((text: string) => {
    set_toast(text);
    window.clearTimeout(toast_timer.current);
    toast_timer.current = window.setTimeout(() => set_toast(''), 2600);
  }, []);

  const commit_layout = useCallback((next: board_layout) => {
    set_layout(next);
    window.clearTimeout(save_timer.current);
    save_timer.current = window.setTimeout(() => {
      void fetch('/api/admin/menu-board', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layout: next }),
      }).catch(() => undefined);
    }, 400);
  }, []);

  function edit_text(key: menu_text_key, value: string) {
    const text = value.replace(/\s+/g, ' ').trim().slice(0, 80);
    const next = { ...layout.texts };
    if (!text || text === MENU_TEXT_DEFAULTS[key]) delete next[key];
    else next[key] = text;
    commit_layout({ ...layout, texts: next });
  }

  async function move_category(item_id: string, from: string, to: string) {
    if (!store) return false;
    const item = store.items.find((row) => row.id === item_id);
    if (!item) return false;
    const next_item = set_item_categories(item, [...item_categories(item).filter((c) => c !== from), to]);
    const prev = store;
    set_store({ ...store, items: store.items.map((row) => (row.id === item_id ? next_item : row)) });
    try {
      const res = await fetch('/api/admin/menu', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: store.version,
          categories: store.categories,
          items: [next_item],
          removed_item_ids: [],
          category_heading_styles: store.category_heading_styles ?? {},
          partial: true,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      say(`«${item.name}» теперь в «${to}» и на сайте`);
      return true;
    } catch {
      set_store(prev);
      say('не сохранилось на сайте, позиция вернулась');
      return false;
    }
  }

  function can_cross(item_id: string, from: string, to: string) {
    if (from === to || !linked) return true;
    if (!store) return false;
    return (
      store.categories.includes(from) &&
      store.categories.includes(to) &&
      store.items.some((row) => row.id === item_id)
    );
  }

  function local_line(rect: DOMRect, edge: 'top' | 'bottom'): line_box | null {
    const root = root_ref.current;
    if (!root) return null;
    const box = root.getBoundingClientRect();
    const scale = box.width / format.w;
    return {
      x: (rect.left - box.left) / scale,
      y: ((edge === 'top' ? rect.top : rect.bottom) - box.top) / scale,
      w: rect.width / scale,
    };
  }

  function find_target(x: number, y: number, payload: drag_payload): drop_target | null {
    const hits = document.elementsFromPoint(x, y).filter((el): el is HTMLElement => el instanceof HTMLElement);
    if (payload.kind === 'item') {
      const row = hits.map((el) => el.closest<HTMLElement>('[data-drop-item]')).find(Boolean);
      if (row) {
        const group_id = row.dataset.groupId || '';
        if (!can_cross(payload.item_id, payload.group_id, group_id)) return null;
        const rect = row.getBoundingClientRect();
        const after = y > rect.top + rect.height / 2;
        const next = after ? (row.nextElementSibling as HTMLElement | null)?.dataset.dropItem ?? null : row.dataset.dropItem || null;
        const line = local_line(rect, after ? 'bottom' : 'top');
        return line ? { kind: 'item', group_id, before: next, line } : null;
      }
      const list = hits.map((el) => el.closest<HTMLElement>('[data-drop-group]')).find(Boolean);
      if (list) {
        const group_id = list.dataset.dropGroup || '';
        if (!can_cross(payload.item_id, payload.group_id, group_id)) return null;
        const line = local_line(list.getBoundingClientRect(), 'bottom');
        return line ? { kind: 'item', group_id, before: null, line } : null;
      }
      return null;
    }
    const block = hits.map((el) => el.closest<HTMLElement>('[data-block-key]')).find(Boolean);
    if (block) {
      const col = block.dataset.col === 'right' ? 'right' : 'left';
      const rect = block.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2;
      const next = after ? (block.nextElementSibling as HTMLElement | null)?.dataset.blockKey ?? null : block.dataset.blockKey || null;
      const line = local_line(rect, after ? 'bottom' : 'top');
      return line ? { kind: 'block', col, before: next, line } : null;
    }
    const column = hits.map((el) => el.closest<HTMLElement>('[data-col]')).find(Boolean);
    if (column) {
      const col = column.dataset.col === 'right' ? 'right' : 'left';
      const last = column.lastElementChild as HTMLElement | null;
      const line = local_line((last ?? column).getBoundingClientRect(), last ? 'bottom' : 'top');
      return line ? { kind: 'block', col, before: null, line } : null;
    }
    return null;
  }

  function finish(payload: drag_payload, target: drop_target | null) {
    if (!target || !groups) return;
    if (payload.kind === 'block' && target.kind === 'block') {
      if (target.before === payload.key) return;
      commit_layout(move_block(layout, columns, payload.key, target.col, target.before));
      return;
    }
    if (payload.kind === 'item' && target.kind === 'item') {
      const shown = [...columns.left, ...columns.right].flatMap((block) => (block.kind === 'group' ? [block.group] : []));
      const into = shown.find((group) => group.id === target.group_id);
      if (!into) return;
      const items = { ...layout.items };
      items[target.group_id] = place_item(
        into.items.map((item) => item.id),
        payload.item_id,
        target.before,
      );
      if (payload.group_id === target.group_id) {
        commit_layout({ ...layout, items });
        return;
      }
      const from = shown.find((group) => group.id === payload.group_id);
      if (from) items[payload.group_id] = from.items.map((item) => item.id).filter((id) => id !== payload.item_id);
      if (linked) {
        void move_category(payload.item_id, payload.group_id, target.group_id);
        commit_layout({ ...layout, items });
        return;
      }
      commit_layout({
        ...layout,
        items,
        moves: move_item_local(layout.moves, payload.item_id, payload.group_id, target.group_id),
      });
      say(`«${payload.label}» теперь в «${into.title}» — только на листе`);
    }
  }

  function hide_block(key: string) {
    commit_layout({ ...layout, hidden: [...layout.hidden.filter((row) => row !== key), key] });
  }

  function show_block(key: string) {
    commit_layout({ ...layout, hidden: layout.hidden.filter((row) => row !== key) });
  }

  function begin(event: React.PointerEvent, payload: drag_payload) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    const touch = event.pointerType !== 'mouse';
    const start_x = event.clientX;
    const start_y = event.clientY;
    let active = false;
    let hold: number | undefined;
    const prev_select = document.body.style.userSelect;

    const block_scroll = (e: TouchEvent) => {
      if (active) e.preventDefault();
    };

    const activate = (x: number, y: number) => {
      active = true;
      document.body.style.userSelect = 'none';
      set_drag(payload);
      set_ghost({ x, y });
    };

    const move = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - start_x, e.clientY - start_y);
      if (!active) {
        if (touch) {
          if (dist > 8) cleanup();
          return;
        }
        if (dist < 5) return;
        activate(e.clientX, e.clientY);
      }
      set_ghost({ x: e.clientX, y: e.clientY });
      const target = find_target(e.clientX, e.clientY, payload);
      drop_ref.current = target;
      set_drop(target);
    };

    const up = () => {
      const target = drop_ref.current;
      const was_active = active;
      cleanup();
      if (was_active) finish(payload, target);
    };

    function cleanup() {
      window.clearTimeout(hold);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('touchmove', block_scroll);
      document.body.style.userSelect = prev_select;
      active = false;
      drop_ref.current = null;
      set_drag(null);
      set_drop(null);
      set_ghost(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block_scroll, { passive: false });
    if (touch) hold = window.setTimeout(() => activate(start_x, start_y), HOLD_MS);
  }

  const dragging_key = drag?.kind === 'block' ? drag.key : null;
  const dragging_item = drag?.kind === 'item' ? `${drag.group_id}::${drag.item_id}` : null;

  return (
    <div
      ref={root_ref}
      className="absolute inset-0 select-none bg-white text-[#20181b]"
      style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}
    >
      <div
        id="menu-sheet-body"
        className="absolute overflow-hidden"
        style={{ top: MENU_PAD_T, left: MENU_PAD_L, right: MENU_PAD_R, bottom: MENU_PAD_B }}
      >
        {failed ? (
          <p className="text-sm text-[#8b8689]">меню не загрузилось</p>
        ) : !groups ? (
          <p className="text-sm text-[#8b8689]">собираю меню…</p>
        ) : !groups.length ? (
          <p className="text-sm text-[#8b8689]">в меню нет позиций</p>
        ) : (
          <div
            id="menu-sheet-fit"
            className="flex items-start"
            style={{ gap: MENU_COL_GAP, ['--menu-k' as string]: k }}
          >
            {(['left', 'right'] as const).map((col) => (
              <div
                key={col}
                data-col={col}
                className="flex min-w-0 flex-1 flex-col self-stretch"
                style={{ gap: sz(MENU_BLOCK_GAP) }}
              >
                {columns[col].map((block) => (
                  <div
                    key={block.key}
                    data-block-key={block.key}
                    data-col={col}
                    className="group/blk relative"
                    style={{ opacity: dragging_key === block.key ? 0.35 : 1 }}
                  >
                    {drag ? null : (
                      <button
                        type="button"
                        title="скрыть с листа (сайт не меняется)"
                        className="absolute right-0 top-0 z-20 flex items-center justify-center rounded-full bg-[#20181b] text-white opacity-0 transition-opacity group-hover/blk:opacity-100 [@media(hover:none)]:opacity-60"
                        style={{ width: sz(44), height: sz(44), fontSize: sz(28), lineHeight: 1 }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => hide_block(block.key)}
                      >
                        ×
                      </button>
                    )}
                    <Block
                      block={block}
                      qr={qr}
                      texts={texts}
                      on_text={edit_text}
                      dragging_item={dragging_item}
                      on_block={(event) =>
                        begin(event, { kind: 'block', key: block.key, label: block_label(block, texts) })
                      }
                      on_item={(event, group, item) =>
                        begin(event, { kind: 'item', item_id: item.id, group_id: group.id, label: item.name })
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {drop ? (
        <div
          className="pointer-events-none absolute z-50 rounded-full"
          style={{
            left: drop.line.x,
            top: drop.line.y - 4,
            width: drop.line.w,
            height: 8,
            background: MENU_ACCENT,
          }}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute right-6 top-4 z-50 rounded-full bg-[#20181b] px-5 py-2.5 text-[22px] text-white">
          {toast}
        </div>
      ) : null}

      {tools
        ? createPortal(
            <div className="flex flex-wrap items-center gap-1 pb-2">
              <div className="flex shrink-0 bg-neutral-100 p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => set_linked(false)}
                  className={`px-3 py-1 ${linked ? 'text-neutral-600' : 'bg-white text-[#20181b] shadow-sm'}`}
                >
                  только лист
                </button>
                <button
                  type="button"
                  onClick={() => (linked ? null : set_asking(true))}
                  className={`px-3 py-1 ${linked ? 'bg-[#c24141] text-white' : 'text-neutral-600'}`}
                >
                  связано с сайтом
                </button>
              </div>
              {Object.keys(layout.moves).length ? (
                <button
                  type="button"
                  title="напитки вернутся в свои категории с сайта"
                  onClick={() => commit_layout({ ...layout, moves: {} })}
                  className="bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
                >
                  категории как на сайте ↺
                </button>
              ) : null}
              {columns.hidden.length ? (
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <span className="px-1 text-neutral-500">скрыто:</span>
                  {columns.hidden.map((block) => (
                    <button
                      key={block.key}
                      type="button"
                      title="вернуть на лист"
                      onClick={() => show_block(block.key)}
                      className="bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200"
                    >
                      {block_label(block, texts)} ↺
                    </button>
                  ))}
                </div>
              ) : null}
            </div>,
            tools,
          )
        : null}

      {asking && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
              onPointerDown={() => set_asking(false)}
            >
              <div
                className="w-full max-w-sm bg-white p-5 text-[#20181b] shadow-xl"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="text-lg font-semibold">точно связать с сайтом?</p>
                <p className="mt-2 text-sm leading-snug text-neutral-600">
                  перенос напитка в другую категорию сразу поменяет меню на сайте. скрытие и порядок
                  на листе сайт не трогают.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => set_asking(false)} className="bg-neutral-100 px-4 py-2 text-sm">
                    отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      set_linked(true);
                      set_asking(false);
                    }}
                    className="bg-[#c24141] px-4 py-2 text-sm text-white"
                  >
                    да, связать
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {drag && ghost && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[200] rounded-full bg-[#20181b] px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
              style={{ left: ghost.x + 14, top: ghost.y + 14 }}
            >
              {drag.label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type text_props = {
  texts: menu_text_map;
  on_text: (key: menu_text_key, value: string) => void;
};

function Block({
  block,
  qr,
  texts,
  on_text,
  dragging_item,
  on_block,
  on_item,
}: text_props & {
  block: menu_block;
  qr: string;
  dragging_item: string | null;
  on_block: (event: React.PointerEvent) => void;
  on_item: (event: React.PointerEvent, group: menu_group, item: menu_card) => void;
}) {
  if (block.kind === 'group') {
    return <GroupBlock group={block.group} dragging_item={dragging_item} on_head={on_block} on_item={on_item} />;
  }
  return (
    <div className="cursor-grab" onPointerDown={on_block}>
      {block.kind === 'logo' ? <LogoBlock texts={texts} on_text={on_text} /> : null}
      {block.kind === 'sugar' ? <SugarBlock texts={texts} on_text={on_text} /> : null}
      {block.kind === 'extra' ? <ExtraBlock texts={texts} on_text={on_text} /> : null}
      {block.kind === 'note' ? <NoteBlock qr={qr} texts={texts} on_text={on_text} /> : null}
    </div>
  );
}

function Editable({
  id,
  texts,
  on_text,
  className = '',
  style,
}: text_props & { id: menu_text_key; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const live = useRef(false);
  const [editing, set_editing] = useState(false);
  const value = texts[id];

  function finish(save: boolean) {
    const el = ref.current;
    if (!el || !live.current) return;
    live.current = false;
    const text = el.textContent || '';
    el.textContent = '';
    set_editing(false);
    if (save) on_text(id, text);
    el.blur();
  }

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.textContent = value;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing, value]);

  return (
    <span
      ref={ref}
      className={`${className} ${editing ? 'cursor-text select-text rounded-[0.2em] outline-none ring-2 ring-[#FF6B6B]' : 'hover:opacity-70'}`}
      style={style}
      contentEditable={editing}
      suppressContentEditableWarning
      title={editing ? undefined : 'двойной клик — поменять текст'}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (live.current) return;
        live.current = true;
        set_editing(true);
      }}
      onPointerDown={editing ? (event) => event.stopPropagation() : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          finish(event.key === 'Enter');
        }
      }}
      onBlur={() => finish(true)}
    >
      {editing ? null : value}
    </span>
  );
}

function GroupBlock({
  group,
  dragging_item,
  on_head,
  on_item,
}: {
  group: menu_group;
  dragging_item: string | null;
  on_head: (event: React.PointerEvent) => void;
  on_item: (event: React.PointerEvent, group: menu_group, item: menu_card) => void;
}) {
  const big = menu_big(group);
  return (
    <section className="flex w-full flex-col">
      <h3
        className="m-0 cursor-grab font-heading-soft uppercase leading-[1.05]"
        style={{ fontSize: sz(Math.round(36 * 1.4)), fontWeight: 700, marginBottom: sz(big ? 28 : 20) }}
        onPointerDown={on_head}
      >
        {group.title}
      </h3>
      <div data-drop-group={group.id} className="flex flex-col" style={{ gap: sz(big ? 36 : 40) }}>
        {group.items.map((item) => (
          <div
            key={item.id}
            data-drop-item={item.id}
            data-group-id={group.id}
            className="cursor-grab"
            style={{ opacity: dragging_item === `${group.id}::${item.id}` ? 0.35 : 1 }}
            onPointerDown={(event) => on_item(event, group, item)}
          >
            <Item item={item} big={big} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LogoBlock(props: text_props) {
  return (
    <div className="flex items-center" style={{ height: sz(MENU_LOGO.h) }}>
      <Editable
        {...props}
        id="logo"
        className="leading-none"
        style={{
          fontFamily: 'Fredoka, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: sz(MENU_LOGO.size),
          color: MENU_ACCENT,
          letterSpacing: '0.02em',
        }}
      />
    </div>
  );
}

const plate_style = (h: number): React.CSSProperties => ({
  height: sz(h),
  padding: sz(MENU_CARD.pad),
  borderRadius: sz(MENU_CARD.radius),
  border: `${sz(MENU_CARD.border)} solid ${MENU_INK}`,
});

function SugarBlock(props: text_props) {
  const top = MENU_SUGAR.levels[MENU_SUGAR.levels.length - 1];
  return (
    <div className="flex flex-col justify-between" style={plate_style(MENU_SUGAR.h)}>
      <Editable
        {...props}
        id="sugar_title"
        className="self-start uppercase leading-none"
        style={{ fontSize: sz(MENU_CARD.title), fontWeight: 800 }}
      />
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: `repeat(${MENU_SUGAR.levels.length}, minmax(0, 1fr))` }}
      >
        {MENU_SUGAR.levels.map((level) => (
          <div key={level} className="flex flex-col items-center" style={{ gap: sz(10) }}>
            <span
              className="relative flex items-center justify-center overflow-hidden rounded-full"
              style={{
                width: sz(MENU_SUGAR.dot),
                height: sz(MENU_SUGAR.dot),
                border: `${sz(MENU_CARD.border)} solid ${MENU_INK}`,
              }}
            >
              <span
                className="absolute inset-x-0 bottom-0 block"
                style={{ height: `${Math.min(level, 100)}%`, background: MENU_INK }}
              />
              {level > 100 ? (
                <span className="relative leading-none text-white" style={{ fontSize: sz(34), fontWeight: 800 }}>
                  +
                </span>
              ) : null}
            </span>
            <Editable
              {...props}
              id={sugar_key(level)}
              className="leading-none"
              style={{ fontSize: sz(MENU_SUGAR.label), fontWeight: 600 }}
            />
            {level === top ? (
              <Editable
                {...props}
                id="sugar_150_price"
                className="leading-none"
                style={{ fontSize: sz(MENU_SUGAR.extra), fontWeight: 700, color: MENU_ACCENT, marginTop: sz(-4) }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtraBlock(props: text_props) {
  return (
    <div className="flex items-stretch justify-between" style={plate_style(MENU_EXTRA.h)}>
      <div className="flex flex-col items-start justify-between">
        <Editable
          {...props}
          id="extra_title"
          className="uppercase leading-none"
          style={{ fontSize: sz(MENU_CARD.title), fontWeight: 800 }}
        />
        <Editable
          {...props}
          id="extra_note"
          className="leading-none"
          style={{ fontSize: sz(MENU_EXTRA.note_size), color: MENU_MUTED }}
        />
      </div>
      <Editable
        {...props}
        id="extra_price"
        className="self-center leading-none"
        style={{ fontSize: sz(MENU_EXTRA.price_size), fontWeight: 500 }}
      />
    </div>
  );
}

function NoteBlock({ qr, ...props }: text_props & { qr: string }) {
  return (
    <div className="flex items-center justify-between" style={{ height: sz(MENU_NOTE.h), gap: sz(24) }}>
      <div className="flex min-w-0 flex-col items-start" style={{ gap: sz(7) }}>
        <Editable
          {...props}
          id="note_title"
          className="leading-none"
          style={{ fontSize: sz(MENU_NOTE.title_size), fontWeight: 700 }}
        />
        <Editable
          {...props}
          id="note_body"
          className="leading-none"
          style={{ fontSize: sz(MENU_NOTE.body_size), color: MENU_MUTED }}
        />
        <Editable
          {...props}
          id="note_site"
          className="leading-none"
          style={{ fontSize: sz(MENU_NOTE.site_size), color: MENU_MUTED }}
        />
      </div>
      {qr ? (
        <img
          src={qr}
          alt=""
          draggable={false}
          className="block shrink-0"
          style={{ width: sz(MENU_NOTE.qr), height: sz(MENU_NOTE.qr) }}
        />
      ) : (
        <div className="shrink-0" style={{ width: sz(MENU_NOTE.qr), height: sz(MENU_NOTE.qr) }} />
      )}
    </div>
  );
}

function Item({ item, big }: { item: menu_card; big: boolean }) {
  const photo = big ? 260 : 164;
  return (
    <div className={big ? 'flex w-full flex-col items-start' : 'flex w-full flex-nowrap items-start'} style={{ gap: sz(big ? 12 : 16) }}>
      <div className="relative shrink-0" style={{ width: sz(photo), height: sz(photo) }}>
        {item.image ? (
          <img src={item.image} alt="" draggable={false} className="relative z-10 h-full w-full object-contain" />
        ) : null}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col justify-start pt-0.5 ${big ? 'w-full' : ''}`}>
        {item.limited ? (
          <div
            className="z-10 mb-3 self-start bg-[#20181b] px-3 py-1.5 font-extrabold uppercase leading-none tracking-widest text-white"
            style={{ fontSize: sz(21) }}
          >
            Limited
          </div>
        ) : null}
        <div className="flex w-full items-start" style={{ gap: sz(big ? 16 : 14) }}>
          <div className="min-w-0 flex-1">
            <div className="uppercase leading-[1.08]" style={{ fontSize: sz(big ? 52 : 36), fontWeight: 400 }}>
              {item.name}
              {item.cold || item.hot ? (
                <span className="ml-2 inline-flex items-center gap-[5px] align-middle">
                  {item.cold ? <Mark kind="cold" big={big} /> : null}
                  {item.hot ? <Mark kind="hot" big={big} /> : null}
                </span>
              ) : null}
            </div>
            {item.desc ? (
              <p className="relative z-10 mt-1.5 line-clamp-2 leading-[1.25] opacity-60" style={{ fontSize: sz(big ? 24 : 18), fontWeight: 400 }}>
                {item.desc}
              </p>
            ) : null}
          </div>
          {item.combo ? (
            <div className="flex shrink-0 items-baseline gap-[10px] pt-0.5">
              <div style={{ fontSize: sz(big ? 48 : 36), fontWeight: 500 }}>{item.price}</div>
              <div className="opacity-55" style={{ fontSize: sz(big ? 20 : 17), fontWeight: 400 }}>
                {item.weight}
              </div>
            </div>
          ) : (
            <div className="flex w-max shrink-0 flex-col pt-0.5" style={{ gap: sz(8) }}>
              <Volume price={item.price} weight={item.weight} big={big} />
              {item.price2 ? <Volume price={item.price2} weight={item.weight2 || '650 мл'} big={big} /> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Volume({ price, weight, big }: { price: string; weight: string; big: boolean }) {
  return (
    <div className="flex flex-col leading-none">
      <div style={{ fontSize: sz(big ? 48 : 36), fontWeight: 500 }}>{price}</div>
      <div className="mt-0.5 opacity-50" style={{ fontSize: sz(big ? 20 : 17), fontWeight: 400 }}>
        {weight}
      </div>
    </div>
  );
}

function Mark({ kind, big }: { kind: 'cold' | 'hot'; big: boolean }) {
  const color = kind === 'cold' ? '#0ea5e9' : '#f43f5e';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ width: sz(big ? 28 : 22), height: sz(big ? 28 : 22) }}
    >
      {kind === 'cold' ? (
        <path d="M12 2v20M4.2 7.2l15.6 9.6M19.8 7.2 4.2 16.8M8 4.2 12 7l4-2.8M8 19.8 12 17l4 2.8" />
      ) : (
        <path d="M12 3c1.6 3.2 5 5.2 5 9.2a5 5 0 0 1-10 0c0-4 3.4-6 5-9.2z" />
      )}
    </svg>
  );
}

function sz(px: number) {
  return `calc(${px}px * var(--menu-k))`;
}
