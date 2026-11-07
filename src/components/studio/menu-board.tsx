'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  MENU_COL_GAP,
  MENU_FOOTER,
  MENU_PAD_L,
  MENU_PAD_R,
  MENU_PAD_T,
  MENU_QR,
  MENU_SITE,
  MENU_TOPPING,
  load_saved_menu,
  load_seen,
  menu_big,
  menu_groups,
  merge_menu,
  type menu_card,
  type menu_group,
  type menu_paint,
} from '@/lib/studio/menu-layout';
import type { menu_item } from '@/lib/types';
import type { studio_format } from '@/lib/studio/model';

export default function MenuBoard({
  format,
  paint_ref,
}: {
  format: studio_format;
  paint_ref: { current: menu_paint | null };
}) {
  const [groups, set_groups] = useState<menu_group[] | null>(null);
  const [failed, set_failed] = useState(false);
  const [qr, set_qr] = useState('');
  const [k, set_k] = useState(1);

  useEffect(() => {
    let live = true;
    Promise.all([load_saved_menu(), fetch('/api/menu').then((res) => (res.ok ? res.json() : Promise.reject(new Error('меню'))))])
      .then(([saved, data]: [unknown, { store?: { categories?: string[]; items?: menu_item[] } }]) => {
        if (!live) return;
        set_groups(merge_menu(saved, menu_groups(data.store), load_seen()));
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

  const left = groups?.filter((group) => group.column !== 'right') ?? [];
  const right = groups?.filter((group) => group.column === 'right') ?? [];

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
  }, [groups, format.w, format.h]);

  paint_ref.current = { k, left, right, qr };

  return (
    <div className="absolute inset-0 bg-white text-[#20181b]" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>
      <div
        id="menu-sheet-body"
        className="absolute overflow-hidden"
        style={{ top: MENU_PAD_T, left: MENU_PAD_L, right: MENU_PAD_R, bottom: MENU_FOOTER }}
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
            <Column groups={left} />
            <Column groups={right} />
          </div>
        )}
      </div>
      <div
        className="absolute flex items-end justify-between"
        style={{ left: MENU_PAD_L, right: MENU_PAD_R, bottom: 28, height: MENU_QR }}
      >
        <p className="m-0 text-[22px] font-medium leading-none tracking-[-0.02em]">{MENU_TOPPING}</p>
        <div className="flex items-end gap-3">
          <span className="pb-1 text-[13px] text-[#8b8689]">yomoyo.su</span>
          {qr ? <img src={qr} alt="" width={MENU_QR} height={MENU_QR} className="block" /> : <div style={{ width: MENU_QR, height: MENU_QR }} />}
        </div>
      </div>
    </div>
  );
}

function Column({ groups }: { groups: menu_group[] }) {
  return (
    <div data-menu-col className="flex min-w-0 flex-1 flex-col" style={{ gap: sz(32) }}>
      {groups.map((group) => (
        <GroupBlock key={group.id} group={group} />
      ))}
    </div>
  );
}

function GroupBlock({ group }: { group: menu_group }) {
  const big = menu_big(group);
  return (
    <section className="flex w-full flex-col">
      <h3
        className="m-0 font-heading-soft uppercase leading-[1.05]"
        style={{ fontSize: sz(Math.round(36 * 1.4)), fontWeight: 700, marginBottom: sz(big ? 28 : 20) }}
      >
        {group.title}
      </h3>
      <div className="flex flex-col" style={{ gap: sz(big ? 36 : 40) }}>
        {group.items.map((item, index) => (
          <Item key={`${item.id}-${index}`} item={item} big={big} />
        ))}
      </div>
    </section>
  );
}

function Item({ item, big }: { item: menu_card; big: boolean }) {
  const photo = big ? 260 : 164;
  return (
    <div className={big ? 'flex w-full flex-col items-start' : 'flex w-full flex-nowrap items-start'} style={{ gap: sz(big ? 12 : 16) }}>
      <div className="relative shrink-0" style={{ width: sz(photo), height: sz(photo) }}>
        {item.image ? <img src={item.image} alt="" className="relative z-10 h-full w-full object-contain" /> : null}
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
