'use client';

import { createElement } from 'react';
import {
  pot_fill_ratio,
  prep_station_alert,
  type prep_station_view,
} from '@/lib/finance/prep-stations';
import { color_for_id } from '@/lib/seller-tile-grid';
import PrepVessel, { liquid_tone_for } from '@/components/seller/prep-vessel';

type props = {
  station: prep_station_view;
  on_open: () => void;
};

const TONE_CARD: Record<string, { bg: string; fg: string; border: string }> = {
  tapioca: { bg: '#FFF1E3', fg: '#C45E1A', border: '#FFD7B0' },
  black_tea: { bg: '#F3E8DC', fg: '#6B3A14', border: '#E0C4A8' },
  green_tea: { bg: '#F0F7E8', fg: '#4F7A22', border: '#D4E8B8' },
};

const ALERT_CSS = `
@keyframes prep-card-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55); transform: scale(1); }
  50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); transform: scale(1.02); }
}
@keyframes prep-card-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.prep-card--alert {
  animation: prep-card-pulse 1.1s ease-in-out infinite;
  border-width: 3px !important;
}
.prep-card--alert-low {
  background: #FEF3C7 !important;
  border-color: #F59E0B !important;
  color: #B45309 !important;
}
.prep-card--alert-empty {
  background: #FEE2E2 !important;
  border-color: #DC2626 !important;
  color: #B91C1C !important;
}
.prep-card__badge {
  position: absolute;
  left: 50%;
  top: 0.45rem;
  z-index: 5;
  transform: translateX(-50%);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: clamp(0.65rem, 2.8cqw, 0.78rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  animation: prep-card-badge 0.9s ease-in-out infinite;
  pointer-events: none;
}
.prep-card__badge--low {
  background: #F59E0B;
  color: #fff;
}
.prep-card--marinade {
  animation: prep-card-marinade 1s ease-in-out infinite;
  border-width: 3px !important;
  border-color: #F59E0B !important;
}
@keyframes prep-card-marinade {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
  50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
}
.prep-card__badge--marinade {
  background: #F59E0B;
  color: #fff;
}
.prep-card__badge--empty {
  background: #DC2626;
  color: #fff;
}
`;

function format_g(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} кг`;
  return `${Math.round(n)} г`;
}

export default function prep_station_card({ station, on_open }: props) {
  const tone = liquid_tone_for(station.id);
  const tint = TONE_CARD[tone] ?? color_for_id(station.id);
  const fill = pot_fill_ratio(station, station.cookedQty);
  const alert = prep_station_alert(station);
  const marinade = station.marinadePending && station.cookedQty > 0;
  const under =
    station.cookedQty <= 0
      ? 'пусто — свари'
      : marinade
        ? 'добавьте маринад'
        : alert === 'low'
          ? `мало! ${format_g(station.cookedQty)}`
          : format_g(station.cookedQty);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ALERT_CSS }} />
      <article
        className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${
          alert === 'empty'
            ? 'prep-card--alert prep-card--alert-empty'
            : alert === 'low'
              ? 'prep-card--alert prep-card--alert-low'
              : marinade
                ? 'prep-card--marinade'
                : ''
        }`}
        style={
          alert === 'ok'
            ? {
                backgroundColor: tint.bg,
                borderColor: tint.border,
                color: tint.fg,
                containerType: 'size',
              }
            : { containerType: 'size' }
        }
      >
        {alert === 'low' ? (
          <span className="prep-card__badge prep-card__badge--low">мало</span>
        ) : null}
        {marinade && alert === 'ok' ? (
          <span className="prep-card__badge prep-card__badge--marinade">маринад</span>
        ) : null}
        {alert === 'empty' ? (
          <span className="prep-card__badge prep-card__badge--empty">пусто</span>
        ) : null}
        <button
          type="button"
          onClick={on_open}
          className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3 active:scale-[0.98]"
          aria-label={`${station.label}: ${under}`}
        >
          <div className="aspect-square w-[min(100%,64cqh)] max-w-[9.5rem] shrink-0">
            {createElement(PrepVessel, {
              kind: station.kind,
              fill,
              size: 'fill',
              tone,
            })}
          </div>
          <p className="mt-1 max-w-[92%] truncate text-center text-[clamp(0.7rem,3cqw,0.95rem)] font-bold leading-snug">
            {station.label}
          </p>
          <p className="mt-0.5 max-w-[92%] truncate text-center text-[clamp(0.6rem,2.6cqw,0.78rem)] font-semibold tabular-nums opacity-90">
            {under}
          </p>
        </button>
      </article>
    </>
  );
}
