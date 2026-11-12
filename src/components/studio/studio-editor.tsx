'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { download_png, file_to_image } from '@/lib/studio/export';
import { download_menu_png } from '@/lib/studio/menu-export';
import { MENU_TOOLS_ID, type menu_paint } from '@/lib/studio/menu-layout';
import MenuBoard from '@/components/studio/menu-board';
import {
  FORMAT_GROUPS,
  FORMATS,
  SWATCHES,
  font_family,
  format_by_id,
  load_doc,
  make_layer,
  painted_layers,
  preset,
  px,
  save_doc,
  snap_move,
  type studio_align,
  type studio_doc,
  type studio_font,
  type studio_layer,
} from '@/lib/studio/model';

const BANNER_FORMATS = FORMATS.filter((item) => item.group === 'баннер');

type menu_state = { x: number; y: number; layer_id: string | null };
type corner = 'nw' | 'ne' | 'sw' | 'se';

export default function StudioEditor() {
  const params = useSearchParams();
  const initial = format_by_id(params.get('format')).id;
  const [doc, set_doc] = useState<studio_doc | null>(null);
  const [selected, set_selected] = useState<string | null>(null);
  const [editing, set_editing] = useState<string | null>(null);
  const [menu, set_menu] = useState<menu_state | null>(null);
  const [guides, set_guides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const [fit, set_fit] = useState(0.2);
  const [narrow, set_narrow] = useState(false);
  const [full, set_full] = useState(false);
  const [busy, set_busy] = useState('');
  const [note, set_note] = useState('');
  const [undo_n, set_undo_n] = useState(0);
  const doc_ref = useRef<studio_doc | null>(null);
  const scale_ref = useRef(0.2);
  const stage_ref = useRef<HTMLDivElement>(null);
  const file_ref = useRef<HTMLInputElement>(null);
  const file_cb = useRef<((src: string) => void) | null>(null);
  const past = useRef<studio_doc[]>([]);
  const menu_paint = useRef<menu_paint | null>(null);
  const booted = useRef(false);

  doc_ref.current = doc;
  scale_ref.current = fit;

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    set_doc(load_doc(initial));
  }, [initial]);

  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(() => {
      try {
        save_doc(doc);
        set_note('');
      } catch {
        set_note('не хватило места в браузере — убери тяжёлое фото');
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const apply = () => set_narrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const on_change = () => set_full(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on_change);
    return () => document.removeEventListener('fullscreenchange', on_change);
  }, []);

  const format = format_by_id(doc?.formatId);

  useEffect(() => {
    const el = stage_ref.current;
    if (!el || !doc) return;
    const measure = () => {
      const pad = narrow ? 28 : 32;
      const next = Math.min((el.clientWidth - pad) / format.w, (el.clientHeight - pad) / format.h);
      set_fit(Math.min(1.15, Math.max(0.05, next)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, format.w, format.h, narrow]);

  useEffect(() => {
    stage_ref.current?.scrollTo(0, 0);
  }, [format.id]);

  function begin_pan(event: React.PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-layer], button, input, textarea, a')) return;
    const stage = stage_ref.current;
    if (!stage) return;
    const start_x = event.clientX;
    const start_y = event.clientY;
    const left = stage.scrollLeft;
    const top = stage.scrollTop;
    let moved = false;
    function move(e: PointerEvent) {
      const dx = e.clientX - start_x;
      const dy = e.clientY - start_y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      stage!.scrollLeft = left - dx;
      stage!.scrollTop = top - dy;
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  useEffect(() => {
    function on_key(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;
      if (!doc_ref.current) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        remove_layer(selected);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        set_menu(null);
        set_editing(null);
        set_selected(null);
      } else if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.005;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        remember();
        patch_layer(selected, (layer) => ({ x: layer.x + dx, y: layer.y + dy }));
      }
    }
    window.addEventListener('keydown', on_key);
    return () => window.removeEventListener('keydown', on_key);
  });

  function remember() {
    if (!doc_ref.current) return;
    past.current.push(structuredClone(doc_ref.current));
    if (past.current.length > 40) past.current.shift();
    set_undo_n(past.current.length);
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    set_undo_n(past.current.length);
    set_doc(prev);
    set_menu(null);
  }

  function commit(next: studio_doc) {
    doc_ref.current = next;
    set_doc(next);
  }

  function patch_layer(id: string, partial: Partial<studio_layer> | ((layer: studio_layer) => Partial<studio_layer>)) {
    const current = doc_ref.current;
    if (!current) return;
    const next = {
      ...current,
      layers: current.layers.map((layer) => {
        if (layer.id !== id) return layer;
        const extra = typeof partial === 'function' ? partial(layer) : partial;
        return { ...layer, ...extra };
      }),
    };
    commit(next);
  }

  function patch_doc(partial: Partial<studio_doc>) {
    const current = doc_ref.current;
    if (!current) return;
    commit({ ...current, ...partial });
  }

  function remove_layer(id: string) {
    const current = doc_ref.current;
    if (!current) return;
    remember();
    commit({ ...current, layers: current.layers.filter((layer) => layer.id !== id) });
    set_selected(null);
    set_menu(null);
    set_editing(null);
  }

  function add_layer(partial: Partial<studio_layer> & Pick<studio_layer, 'kind'>) {
    const current = doc_ref.current;
    if (!current) return;
    const z = current.layers.reduce((max, layer) => Math.max(max, layer.z), 0) + 1;
    const layer = make_layer({ ...partial, z });
    remember();
    commit({ ...current, layers: [...current.layers, layer] });
    set_selected(layer.id);
    set_editing(null);
    if (narrow) set_menu({ x: 0, y: 0, layer_id: layer.id });
    else set_menu(null);
  }

  function switch_format(id: string) {
    const current = doc_ref.current;
    if (!current) return;
    const next_id = format_by_id(id).id;
    if (next_id === current.formatId) return;
    try {
      save_doc(current);
    } catch {
      set_note('не хватило места в браузере');
    }
    past.current = [];
    set_undo_n(0);
    set_selected(null);
    set_menu(null);
    set_editing(null);
    const next = load_doc(next_id);
    commit(next);
  }

  function open_menu(x: number, y: number, layer_id: string | null) {
    set_menu({ x, y, layer_id });
    if (layer_id) set_selected(layer_id);
  }

  function begin_drag(event: React.PointerEvent, layer: studio_layer) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-handle]')) return;
    if (editing === layer.id) return;
    event.preventDefault();
    event.stopPropagation();
    set_selected(layer.id);
    const start_x = event.clientX;
    const start_y = event.clientY;
    const origin = { ...layer };
    const before = structuredClone(doc_ref.current);
    let moved = false;
    let held_open = false;
    let timer = 0;
    if (event.pointerType !== 'mouse') {
      timer = window.setTimeout(() => {
        if (moved) return;
        held_open = true;
        open_menu(start_x, start_y, layer.id);
      }, 420);
    }
    const move = (ev: PointerEvent) => {
      if (held_open) return;
      const dist = Math.hypot(ev.clientX - start_x, ev.clientY - start_y);
      if (dist > 8 && timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      if (dist < 2) return;
      moved = true;
      const current = doc_ref.current;
      const fmt = format_by_id(current?.formatId);
      const scale = scale_ref.current || 1;
      const dx = (ev.clientX - start_x) / scale / fmt.w;
      const dy = (ev.clientY - start_y) / scale / fmt.h;
      const snapped = snap_move(
        { ...origin, x: origin.x + dx, y: origin.y + dy },
        current?.layers ?? [],
        ev.altKey,
      );
      set_guides({ v: snapped.v, h: snapped.h });
      patch_layer(layer.id, { x: snapped.layer.x, y: snapped.layer.y });
    };
    const up = () => {
      if (timer) window.clearTimeout(timer);
      set_guides({ v: null, h: null });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved && before) {
        past.current.push(before);
        if (past.current.length > 40) past.current.shift();
        set_undo_n(past.current.length);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function begin_resize(event: React.PointerEvent, layer: studio_layer, corner: corner) {
    event.preventDefault();
    event.stopPropagation();
    set_selected(layer.id);
    const start_x = event.clientX;
    const start_y = event.clientY;
    const origin = { ...layer };
    const before = structuredClone(doc_ref.current);
    const lock = layer.kind === 'image' || layer.kind === 'qr';
    const move = (ev: PointerEvent) => {
      const current = doc_ref.current;
      const fmt = format_by_id(current?.formatId);
      const scale = scale_ref.current || 1;
      const dx = (ev.clientX - start_x) / scale / fmt.w;
      const dy = (ev.clientY - start_y) / scale / fmt.h;
      let { x, y, w, h } = origin;
      if (corner.includes('e')) w = origin.w + dx;
      if (corner.includes('s')) h = origin.h + dy;
      if (corner.includes('w')) {
        x = origin.x + dx;
        w = origin.w - dx;
      }
      if (corner.includes('n')) {
        y = origin.y + dy;
        h = origin.h - dy;
      }
      w = Math.max(0.04, w);
      h = Math.max(0.03, h);
      if (lock) {
        const aspect = origin.h / origin.w;
        h = Math.max(0.03, w * aspect);
        if (corner.includes('n')) y = origin.y + origin.h - h;
        if (corner.includes('w')) x = origin.x + origin.w - w;
      }
      patch_layer(layer.id, { x, y, w, h });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (before) {
        past.current.push(before);
        set_undo_n(past.current.length);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function begin_rotate(event: React.PointerEvent, layer: studio_layer) {
    event.preventDefault();
    event.stopPropagation();
    const board = (event.currentTarget as HTMLElement).closest('[data-board]') as HTMLElement | null;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const cx = rect.left + (layer.x + layer.w / 2) * rect.width;
    const cy = rect.top + (layer.y + layer.h / 2) * rect.height;
    const a0 = Math.atan2(event.clientY - cy, event.clientX - cx);
    const rot0 = layer.rotation;
    const before = structuredClone(doc_ref.current);
    const move = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = rot0 + ((angle - a0) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      patch_layer(layer.id, { rotation: deg });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (before) {
        past.current.push(before);
        set_undo_n(past.current.length);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function pick_image(done: (src: string) => void) {
    file_cb.current = done;
    file_ref.current?.click();
  }

  async function on_file(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file_cb.current) return;
    const done = file_cb.current;
    file_cb.current = null;
    try {
      const src = await file_to_image(file);
      done(src);
    } catch {
      set_note('фото не прочиталось');
    }
  }

  async function export_png() {
    if (!doc || busy) return;
    set_busy('сохраняю…');
    try {
      if (format.group === 'меню') {
        const paint = menu_paint.current;
        if (!paint || (!paint.left.length && !paint.right.length)) throw new Error('меню ещё не собралось');
        await download_menu_png(format, paint);
      } else {
        await download_png(doc, format);
      }
    } catch (err) {
      set_note(err instanceof Error ? err.message : 'не удалось скачать');
    } finally {
      set_busy('');
    }
  }

  async function toggle_full() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const root = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
    } catch {
      set_note('браузер не прячет свою панель — холст уже на весь экран вкладки');
    }
  }

  async function paint_background(prompt: string) {
    const current = doc_ref.current;
    if (!current || busy) return;
    set_busy('рисую фон…');
    set_menu(null);
    try {
      const res = await fetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          brandName: 'yomoyo',
          primaryColor: '#0039A6',
          secondaryColor: '#FF6B6B',
        }),
      });
      const data = (await res.json()) as { image?: string; error?: string };
      if (!res.ok || !data.image) throw new Error(data.error || 'фон не нарисовался');
      let src = data.image;
      if (!src.startsWith('data:')) {
        try {
          const blob = await (await fetch(src)).blob();
          src = await blob_to_data(blob);
        } catch {
          /* ссылка останется в слое, если файл нельзя прочитать заранее */
        }
      }
      const rest = current.layers.filter((layer) => layer.name !== 'фон');
      const z = Math.min(0, ...rest.map((layer) => layer.z)) - 1;
      remember();
      commit({
        ...current,
        layers: [
          ...rest,
          make_layer({ kind: 'image', name: 'фон', src, x: 0, y: 0, w: 1, h: 1, z }),
        ],
      });
    } catch (err) {
      set_note(err instanceof Error ? err.message : 'фон не нарисовался');
    } finally {
      set_busy('');
    }
  }

  function nudge_size(id: string, dir: number) {
    const layer = doc_ref.current?.layers.find((item) => item.id === id);
    if (!layer) return;
    remember();
    if (layer.kind === 'text' || layer.kind === 'qr') {
      patch_layer(id, { fontSize: Math.max(12, Math.min(280, layer.fontSize + dir * 6)) });
      return;
    }
    const factor = dir > 0 ? 1.08 : 0.92;
    const w = Math.max(0.04, layer.w * factor);
    const h = Math.max(0.03, layer.h * factor);
    patch_layer(id, {
      w,
      h,
      x: layer.x - (w - layer.w) / 2,
      y: layer.y - (h - layer.h) / 2,
    });
  }

  const selected_layer = doc?.layers.find((layer) => layer.id === selected) ?? null;
  const menu_layer = doc?.layers.find((layer) => layer.id === menu?.layer_id) ?? null;
  const banner = format.group === 'баннер';
  const menu_sheet = format.group === 'меню';

  if (!doc) {
    return <div className="h-dvh bg-[#eceae8]" />;
  }

  const painted = painted_layers(doc.layers, format);

  return (
    <div className="flex h-dvh flex-col bg-[#eceae8] text-[#20181b]">
      <header className="shrink-0 border-b border-black/10 bg-white px-3 pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-2">
          <a href="/admin/designer" className="shrink-0 text-sm text-neutral-500">
            ← дизайн
          </a>
          <span className="font-logo text-lg text-[#ff6b6b]">yomoyo</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={undo}
              disabled={!undo_n}
              className="px-2 py-1.5 text-sm text-neutral-500 disabled:opacity-30"
            >
              назад
            </button>
            <button
              type="button"
              onClick={() => void export_png()}
              disabled={Boolean(busy)}
              className="bg-[#20181b] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              png
            </button>
            <button
              type="button"
              onClick={() => void toggle_full()}
              className="bg-accent px-3 py-1.5 text-sm text-white"
            >
              {full ? 'свернуть' : 'на весь экран'}
            </button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {FORMAT_GROUPS.map((group) => {
            const active =
              group.id === 'banner' ? banner : group.id === 'menu' ? menu_sheet : format.id === group.format;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  if (active) return;
                  switch_format(group.format);
                }}
                className={`shrink-0 px-3 py-1.5 text-sm ${
                  active ? 'bg-[#20181b] text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        {menu_sheet ? (
          <div className="flex gap-1 overflow-x-auto pb-2">
            {FORMATS.filter((item) => item.group === 'меню').map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switch_format(item.id)}
                className={`shrink-0 px-3 py-1.5 text-sm ${
                  format.id === item.id ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {menu_sheet ? <div id={MENU_TOOLS_ID} /> : null}
        {banner ? (
          <div className="flex gap-1 overflow-x-auto pb-2">
            {BANNER_FORMATS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switch_format(item.id)}
                className={`shrink-0 px-3 py-1.5 text-sm ${
                  format.id === item.id ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {index + 1} · {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <p className="pb-2 text-[11px] leading-snug text-neutral-500">
          левая кнопка двигает, угол меняет размер, кружок крутит. правая — текст, цвет, фото.
          {narrow ? ' на телефоне удерживай палец.' : ''}
          {format.panels ? ' левая карточка буклета повторяется на три панели.' : ''}
          {banner ? ' баннер один, размера четыре.' : ''}
          {menu_sheet ? ' тащи заголовки, плашки и напитки, × — скрыть с листа, двойной клик по тексту плашки — поменять.' : ''}
        </p>
        {note ? <p className="pb-2 text-[11px] text-[#c24141]">{note}</p> : null}
      </header>

      <div
        ref={stage_ref}
        className={`relative min-h-0 flex-1 overflow-auto ${menu_sheet ? 'cursor-grab' : ''}`}
        onPointerDown={begin_pan}
        onContextMenu={(event) => {
          if (menu_sheet) {
            event.preventDefault();
            return;
          }
          if ((event.target as HTMLElement).closest('[data-layer]')) return;
          event.preventDefault();
          set_selected(null);
          open_menu(event.clientX, event.clientY, null);
        }}
      >
        <div
          className="flex p-4"
          style={{ minWidth: '100%', minHeight: '100%', alignItems: 'safe center', justifyContent: 'safe center' }}
        >
        <div className="relative shrink-0" style={{ width: format.w * fit, height: format.h * fit }}>
          <div
            data-board
            className="relative"
            style={{
              width: format.w,
              height: format.h,
              transform: `scale(${fit})`,
              transformOrigin: 'top left',
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.boardBg) {
                set_selected(null);
                set_menu(null);
                set_editing(null);
              }
            }}
          >
            <div
              data-board-bg
              className="absolute inset-0"
              style={{
                background:
                  doc.bg2.toLowerCase() !== doc.bg.toLowerCase()
                    ? `linear-gradient(180deg, ${doc.bg} 0%, ${doc.bg2} 100%)`
                    : doc.bg,
              }}
            />
            {format.panels && format.panel_w && format.gutter != null
              ? Array.from({ length: format.panels + 1 }, (_, index) => (
                  <div
                    key={index}
                    className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-black/25"
                    style={{ left: format.gutter! + index * format.panel_w! }}
                  />
                ))
              : null}
            {guides.v != null ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 border-l border-sky-400"
                style={{ left: guides.v * format.w }}
              />
            ) : null}
            {guides.h != null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-sky-400"
                style={{ top: guides.h * format.h }}
              />
            ) : null}
            {menu_sheet ? <MenuBoard format={format} paint_ref={menu_paint} /> : null}
            {menu_sheet
              ? null
              : painted.map((item) => (
              <LayerView
                key={item.key}
                layer={item.layer}
                live={item.live}
                format_w={format.w}
                format_h={format.h}
                selected={item.live && selected === item.layer.id}
                editing={item.live && editing === item.layer.id && !narrow}
                big={narrow}
                on_pointer_down={(event) => begin_drag(event, doc.layers.find((layer) => layer.id === item.layer.id) ?? item.layer)}
                on_context={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const live = doc.layers.find((layer) => layer.id === item.layer.id);
                  if (!live) return;
                  open_menu(event.clientX, event.clientY, live.id);
                }}
                on_double={() => {
                  const live = doc.layers.find((layer) => layer.id === item.layer.id);
                  if (!live) return;
                  if (narrow || live.kind === 'image' || live.kind === 'shape') {
                    open_menu(window.innerWidth / 2, window.innerHeight - 20, live.id);
                    return;
                  }
                  set_selected(live.id);
                  set_editing(live.id);
                }}
                on_resize={(event, corner) => {
                  const live = doc.layers.find((layer) => layer.id === item.layer.id);
                  if (live) begin_resize(event, live, corner);
                }}
                on_rotate={(event) => {
                  const live = doc.layers.find((layer) => layer.id === item.layer.id);
                  if (live) begin_rotate(event, live);
                }}
                on_text={(text) => patch_layer(item.layer.id, { text })}
                on_edit_end={() => set_editing(null)}
              />
            ))}
          </div>
        </div>
        </div>
        {busy ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/50 text-sm">
            {busy}
          </div>
        ) : null}
      </div>

      {narrow && !menu_sheet ? (
        <footer className="shrink-0 border-t border-black/10 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-1 overflow-x-auto">
            <BarButton label="текст" onClick={() => add_layer({ kind: 'text', text: 'текст', name: 'текст', w: 0.7, h: 0.1, fontSize: 56 })} />
            <BarButton
              label="фото"
              onClick={() =>
                pick_image((src) => add_layer({ kind: 'image', name: 'фото', src, x: 0.2, y: 0.35, w: 0.6, h: 0.35 }))
              }
            />
            <BarButton
              label="цена"
              onClick={() =>
                add_layer({
                  kind: 'text',
                  name: 'цена',
                  text: '360 ₽',
                  x: 0.08,
                  y: 0.4,
                  w: 0.42,
                  h: 0.08,
                  fontSize: 40,
                  color: '#FFFFFF',
                  fill: '#FF6B6B',
                  align: 'center',
                  radius: 999,
                })
              }
            />
            <BarButton
              label="фигура"
              onClick={() =>
                add_layer({ kind: 'shape', name: 'фигура', x: 0.15, y: 0.4, w: 0.4, h: 0.12, fill: '#FF6B6B', radius: 24 })
              }
            />
            <BarButton
              label="qr"
              onClick={() =>
                add_layer({
                  kind: 'qr',
                  name: 'qr',
                  text: 'https://yomoyo.su',
                  x: 0.68,
                  y: 0.7,
                  w: 0.22,
                  h: 0.16,
                  color: '#20181B',
                })
              }
            />
            <BarButton
              label="фон"
              onClick={() => {
                set_selected(null);
                open_menu(0, 0, null);
              }}
            />
          </div>
          {selected_layer ? (
            <div className="mt-1 flex gap-1 overflow-x-auto">
              <BarButton label="ещё" onClick={() => open_menu(0, 0, selected_layer.id)} />
              <BarButton label="меньше" onClick={() => nudge_size(selected_layer.id, -1)} />
              <BarButton label="больше" onClick={() => nudge_size(selected_layer.id, 1)} />
              <BarButton label="удалить" onClick={() => remove_layer(selected_layer.id)} />
            </div>
          ) : null}
        </footer>
      ) : null}

      {menu ? (
        <StudioMenu
          menu={menu}
          narrow={narrow}
          layer={menu_layer}
          doc={doc}
          on_close={() => set_menu(null)}
          on_remember={remember}
          on_patch_layer={(partial) => {
            if (!menu.layer_id) return;
            patch_layer(menu.layer_id, partial);
          }}
          on_patch_doc={(partial) => patch_doc(partial)}
          on_add={add_layer}
          on_remove={() => menu.layer_id && remove_layer(menu.layer_id)}
          on_pick={pick_image}
          on_paint={(prompt) => void paint_background(prompt)}
          on_reset={() => {
            remember();
            commit(preset(doc.formatId));
            set_menu(null);
            set_selected(null);
          }}
          on_order={(dir) => {
            if (!menu.layer_id || !doc_ref.current) return;
            const zs = doc_ref.current.layers.map((layer) => layer.z);
            remember();
            patch_layer(menu.layer_id, {
              z: dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1,
            });
          }}
        />
      ) : null}

      <input
        ref={file_ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => void on_file(event)}
      />
    </div>
  );
}

function BarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 bg-neutral-100 px-3 py-2 text-sm">
      {label}
    </button>
  );
}

function LayerView({
  layer,
  live,
  format_w,
  format_h,
  selected,
  editing,
  big,
  on_pointer_down,
  on_context,
  on_double,
  on_resize,
  on_rotate,
  on_text,
  on_edit_end,
}: {
  layer: studio_layer;
  live: boolean;
  format_w: number;
  format_h: number;
  selected: boolean;
  editing: boolean;
  big: boolean;
  on_pointer_down: (event: React.PointerEvent) => void;
  on_context: (event: React.MouseEvent) => void;
  on_double: () => void;
  on_resize: (event: React.PointerEvent, corner: corner) => void;
  on_rotate: (event: React.PointerEvent) => void;
  on_text: (text: string) => void;
  on_edit_end: () => void;
}) {
  const size = px(layer.fontSize, format_w);
  return (
    <div
      data-layer
      className={`absolute touch-none select-none ${live ? '' : 'pointer-events-none'}`}
      style={{
        left: layer.x * format_w,
        top: layer.y * format_h,
        width: layer.w * format_w,
        height: layer.h * format_h,
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: 'center center',
        zIndex: selected ? 40 : layer.z,
        outline: selected ? '2px solid #0039A6' : 'none',
        outlineOffset: 2,
      }}
      onPointerDown={live ? on_pointer_down : undefined}
      onContextMenu={live ? on_context : undefined}
      onDoubleClick={
        live
          ? (event) => {
              event.stopPropagation();
              on_double();
            }
          : undefined
      }
    >
      {layer.kind === 'text' ? (
        editing ? (
          <textarea
            autoFocus
            value={layer.text}
            onChange={(event) => on_text(event.target.value)}
            onBlur={on_edit_end}
            onPointerDown={(event) => event.stopPropagation()}
            className="h-full w-full resize-none bg-white/90 p-1 text-[#20181b] outline-none"
            style={{ fontFamily: font_family(layer.font), fontWeight: layer.weight, fontSize: Math.max(14, size) }}
          />
        ) : (
          <div
            className="flex h-full w-full items-center overflow-visible"
            style={{
              background: layer.fill || 'transparent',
              borderRadius: px(layer.radius, format_w),
              padding: 2,
            }}
          >
            <span
              className="block w-full whitespace-pre-wrap break-words"
              style={{
                fontFamily: font_family(layer.font),
                fontWeight: layer.weight,
                fontSize: size,
                color: layer.color,
                textAlign: layer.align,
                textDecoration: layer.strike ? 'line-through' : undefined,
                lineHeight: 1.02,
                letterSpacing: layer.font === 'logo' ? '0.04em' : undefined,
              }}
            >
              {layer.text}
            </span>
          </div>
        )
      ) : null}
      {layer.kind === 'image' ? (
        layer.src ? (
          <img src={layer.src} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-dashed border-black/20 text-xs text-neutral-400">
            фото
          </div>
        )
      ) : null}
      {layer.kind === 'shape' ? (
        <div
          className="h-full w-full"
          style={{ background: layer.fill || '#FF6B6B', borderRadius: px(layer.radius, format_w) }}
        />
      ) : null}
      {layer.kind === 'qr' ? <QrMark text={layer.text} color={layer.color} /> : null}
      {selected ? (
        <>
          <div
            data-handle
            onPointerDown={on_rotate}
            title="поворот, shift — по 15°"
            className="absolute left-1/2 flex -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-[#0039A6] bg-white"
            style={{ top: big ? -40 : -28, width: big ? 28 : 18, height: big ? 28 : 18 }}
          />
          {(['nw', 'ne', 'sw', 'se'] as corner[]).map((corner) => (
            <div
              key={corner}
              data-handle
              onPointerDown={(event) => on_resize(event, corner)}
              className="absolute border border-[#0039A6] bg-white"
              style={{
                width: big ? 22 : 12,
                height: big ? 22 : 12,
                left: corner.includes('w') ? (big ? -11 : -6) : undefined,
                right: corner.includes('e') ? (big ? -11 : -6) : undefined,
                top: corner.includes('n') ? (big ? -11 : -6) : undefined,
                bottom: corner.includes('s') ? (big ? -11 : -6) : undefined,
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function QrMark({ text, color }: { text: string; color: string }) {
  const [src, set_src] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text || 'https://yomoyo.su', {
      margin: 0,
      width: 512,
      color: { dark: color || '#20181B', light: '#00000000' },
    })
      .then((url) => {
        if (live) set_src(url);
      })
      .catch(() => {
        if (live) set_src('');
      });
    return () => {
      live = false;
    };
  }, [text, color]);
  return src ? <img src={src} alt="" className="h-full w-full" /> : null;
}

function StudioMenu({
  menu,
  narrow,
  layer,
  doc,
  on_close,
  on_remember,
  on_patch_layer,
  on_patch_doc,
  on_add,
  on_remove,
  on_pick,
  on_paint,
  on_reset,
  on_order,
}: {
  menu: menu_state;
  narrow: boolean;
  layer: studio_layer | null;
  doc: studio_doc;
  on_close: () => void;
  on_remember: () => void;
  on_patch_layer: (partial: Partial<studio_layer>) => void;
  on_patch_doc: (partial: Partial<studio_doc>) => void;
  on_add: (partial: Partial<studio_layer> & Pick<studio_layer, 'kind'>) => void;
  on_remove: () => void;
  on_pick: (done: (src: string) => void) => void;
  on_paint: (prompt: string) => void;
  on_reset: () => void;
  on_order: (dir: number) => void;
}) {
  const [prompt, set_prompt] = useState('плакат yomoyo: крупный бабл-ти, короткий слоган по-русски');
  const remembered = useRef(false);
  useEffect(() => {
    remembered.current = false;
  }, [layer?.id, menu.layer_id]);
  function edit_layer(partial: Partial<studio_layer>) {
    if (!remembered.current) {
      on_remember();
      remembered.current = true;
    }
    on_patch_layer(partial);
  }
  function edit_doc(partial: Partial<studio_doc>) {
    if (!remembered.current) {
      on_remember();
      remembered.current = true;
    }
    on_patch_doc(partial);
  }
  const body = (
    <div className="flex flex-col gap-3 text-sm" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading-soft text-base">{layer ? layer.name || kind_label(layer.kind) : 'холст'}</p>
        <button type="button" onClick={on_close} className="text-neutral-400">
          закрыть
        </button>
      </div>
      {layer?.kind === 'text' || layer?.kind === 'qr' ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-neutral-500">{layer.kind === 'qr' ? 'ссылка' : 'надпись'}</span>
          <textarea
            rows={3}
            value={layer.text}
            onChange={(event) => edit_layer({ text: event.target.value })}
            className="w-full border border-neutral-200 p-2"
          />
        </label>
      ) : null}
      {layer && (layer.kind === 'text' || layer.kind === 'qr' || layer.kind === 'shape') ? (
        <ColorRow
          label={layer.kind === 'shape' ? 'цвет' : 'цвет текста'}
          value={layer.kind === 'shape' ? layer.fill || '#FF6B6B' : layer.color}
          onChange={(value) => edit_layer(layer.kind === 'shape' ? { fill: value } : { color: value })}
        />
      ) : null}
      {layer?.kind === 'text' ? (
        <>
          <ColorRow
            label="заливка"
            value={layer.fill || '#FFFFFF'}
            onChange={(value) => edit_layer({ fill: value })}
          />
          <button type="button" className="text-left text-neutral-500" onClick={() => edit_layer({ fill: '' })}>
            без заливки
          </button>
          <div className="flex gap-1">
            {(['logo', 'heading', 'display', 'sans'] as studio_font[]).map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => edit_layer({ font })}
                className={`flex-1 py-2 ${layer.font === font ? 'bg-[#20181b] text-white' : 'bg-neutral-100'}`}
              >
                {font === 'logo' ? 'лого' : font === 'heading' ? 'заг' : font === 'display' ? 'акц' : 'текст'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {[400, 600, 800].map((weight) => (
              <button
                key={weight}
                type="button"
                onClick={() => edit_layer({ weight })}
                className={`flex-1 py-2 ${layer.weight === weight ? 'bg-[#20181b] text-white' : 'bg-neutral-100'}`}
              >
                {weight}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as studio_align[]).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => edit_layer({ align })}
                className={`flex-1 py-2 ${layer.align === align ? 'bg-[#20181b] text-white' : 'bg-neutral-100'}`}
              >
                {align === 'left' ? 'лево' : align === 'center' ? 'центр' : 'право'}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500">размер · {Math.round(layer.fontSize)}</span>
            <input
              type="range"
              min={12}
              max={220}
              value={layer.fontSize}
              onChange={(event) => edit_layer({ fontSize: Number(event.target.value) })}
            />
          </label>
          <button type="button" className="text-left" onClick={() => edit_layer({ strike: !layer.strike })}>
            {layer.strike ? 'убрать зачёркивание' : 'зачеркнуть'}
          </button>
        </>
      ) : null}
      {layer?.kind === 'image' ? (
        <button
          type="button"
          className="bg-neutral-100 py-2"
          onClick={() => on_pick((src) => edit_layer({ src }))}
        >
          заменить фото
        </button>
      ) : null}
      {!layer ? (
        <>
          <button type="button" className="bg-neutral-100 py-2" onClick={() => on_add({ kind: 'text', text: 'текст', name: 'текст', w: 0.7, h: 0.1, fontSize: 56 })}>
            текст
          </button>
          <button
            type="button"
            className="bg-neutral-100 py-2"
            onClick={() => on_pick((src) => on_add({ kind: 'image', name: 'фото', src, x: 0.2, y: 0.35, w: 0.6, h: 0.35 }))}
          >
            фото
          </button>
          <button
            type="button"
            className="bg-neutral-100 py-2"
            onClick={() =>
              on_add({
                kind: 'text',
                name: 'цена',
                text: '360 ₽',
                w: 0.42,
                h: 0.08,
                fontSize: 40,
                color: '#FFFFFF',
                fill: '#FF6B6B',
                align: 'center',
                radius: 999,
              })
            }
          >
            цена
          </button>
          <button
            type="button"
            className="bg-neutral-100 py-2"
            onClick={() => on_add({ kind: 'shape', name: 'фигура', w: 0.4, h: 0.12, fill: '#FF6B6B', radius: 24 })}
          >
            фигура
          </button>
          <button
            type="button"
            className="bg-neutral-100 py-2"
            onClick={() =>
              on_add({ kind: 'qr', name: 'qr', text: 'https://yomoyo.su', x: 0.68, y: 0.7, w: 0.22, h: 0.16, color: '#20181B' })
            }
          >
            qr
          </button>
          <ColorRow label="фон сверху" value={doc.bg} onChange={(bg) => edit_doc({ bg })} />
          <ColorRow label="фон снизу" value={doc.bg2} onChange={(bg2) => edit_doc({ bg2 })} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500">нарисовать фон</span>
            <textarea rows={3} value={prompt} onChange={(event) => set_prompt(event.target.value)} className="w-full border border-neutral-200 p-2" />
            <button type="button" className="bg-accent py-2 text-white" onClick={() => on_paint(prompt)}>
              нарисовать
            </button>
          </label>
          <button type="button" className="text-left text-neutral-500" onClick={on_reset}>
            вернуть заготовку
          </button>
        </>
      ) : null}
      {layer ? (
        <div className="flex gap-1">
          <button type="button" className="flex-1 bg-neutral-100 py-2" onClick={() => on_order(1)}>
            выше
          </button>
          <button type="button" className="flex-1 bg-neutral-100 py-2" onClick={() => on_order(-1)}>
            ниже
          </button>
          <button type="button" className="flex-1 bg-neutral-100 py-2 text-[#c24141]" onClick={on_remove}>
            удалить
          </button>
        </div>
      ) : null}
    </div>
  );

  if (narrow) {
    return (
      <div className="fixed inset-0 z-[80] flex items-end bg-black/30" onPointerDown={on_close}>
        <div
          className="max-h-[72dvh] w-full overflow-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {body}
        </div>
      </div>
    );
  }

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 300));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 80));
  return (
    <>
      <div className="fixed inset-0 z-[70]" onPointerDown={on_close} onContextMenu={(event) => event.preventDefault()} />
      <div
        className="fixed z-[80] max-h-[70vh] w-[280px] overflow-auto bg-white p-3 shadow-xl"
        style={{ left, top }}
      >
        {body}
      </div>
    </>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <div className="flex items-center gap-1">
        {SWATCHES.map((swatch) => (
          <button
            key={`${label}-${swatch}`}
            type="button"
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            className={`h-7 w-7 border ${value.toLowerCase() === swatch.toLowerCase() ? 'border-[#20181b]' : 'border-black/10'}`}
            style={{ background: swatch }}
          />
        ))}
        <input
          type="color"
          value={to_hex(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
        />
      </div>
    </div>
  );
}

function kind_label(kind: studio_layer['kind']) {
  if (kind === 'text') return 'текст';
  if (kind === 'image') return 'фото';
  if (kind === 'qr') return 'qr';
  return 'фигура';
}

function to_hex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FF6B6B';
}

function blob_to_data(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('файл не прочитался'));
    reader.readAsDataURL(blob);
  });
}
