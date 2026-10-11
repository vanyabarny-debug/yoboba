'use client';

import type { prep_station_kind } from '@/lib/finance/prep-stations';

export type prep_liquid_tone = 'tapioca' | 'black_tea' | 'green_tea';

type props = {
  kind: prep_station_kind;
  fill: number;
  size?: 'sm' | 'md' | 'lg' | 'fill';
  /** цвет настоя: чёрный / зелёный чай отличаются */
  tone?: prep_liquid_tone;
  label?: string;
  cups?: number;
  grams_label?: string;
  interactive?: boolean;
  on_click?: () => void;
};

const LIQUID: Record<prep_liquid_tone, string> = {
  tapioca: 'linear-gradient(180deg, #C9854A 0%, #7A3F14 42%, #3B1E0A 100%)',
  // чёрный — тёмный янтарь
  black_tea: 'linear-gradient(180deg, #8B4A18 0%, #5C2E0C 45%, #2A1406 100%)',
  // зелёный / жасмин — светлый золотисто-зелёный
  green_tea: 'linear-gradient(180deg, #D8E07A 0%, #A8B84A 42%, #6A7A22 100%)',
};

/** тон заливки по id станции */
export function liquid_tone_for(stationId: string): prep_liquid_tone {
  if (stationId === 'tea_jasmine' || /jasmine|green|зелен/i.test(stationId)) {
    return 'green_tea';
  }
  if (stationId === 'tea_black' || /black|чёрн|черн/i.test(stationId)) {
    return 'black_tea';
  }
  return 'tapioca';
}

const PEARLS = [
  { x: 18, y: 12, s: 6, d: 0 },
  { x: 30, y: 8, s: 8, d: 0.15 },
  { x: 44, y: 14, s: 7, d: 0.3 },
  { x: 56, y: 6, s: 9, d: 0.1 },
  { x: 68, y: 16, s: 6, d: 0.45 },
  { x: 22, y: 24, s: 7, d: 0.55 },
  { x: 36, y: 28, s: 8, d: 0.2 },
  { x: 50, y: 22, s: 6, d: 0.7 },
  { x: 62, y: 30, s: 8, d: 0.35 },
  { x: 74, y: 20, s: 5, d: 0.9 },
  { x: 16, y: 38, s: 7, d: 0.4 },
  { x: 28, y: 42, s: 9, d: 0.05 },
  { x: 42, y: 36, s: 7, d: 0.65 },
  { x: 54, y: 44, s: 8, d: 0.25 },
  { x: 66, y: 40, s: 6, d: 0.8 },
  { x: 24, y: 54, s: 7, d: 0.5 },
  { x: 38, y: 50, s: 6, d: 1.0 },
  { x: 52, y: 56, s: 8, d: 0.12 },
  { x: 64, y: 52, s: 7, d: 0.75 },
  { x: 46, y: 64, s: 6, d: 0.95 },
  { x: 32, y: 62, s: 5, d: 1.15 },
  { x: 58, y: 66, s: 7, d: 0.6 },
];

const BUBBLES = [
  { x: 32, d: 0, dur: 1.6 },
  { x: 48, d: 0.5, dur: 1.95 },
  { x: 62, d: 1.0, dur: 1.5 },
  { x: 40, d: 1.35, dur: 2.2 },
];

function clamp01(n: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export default function PrepVessel({
  kind,
  fill,
  size = 'sm',
  tone,
  label,
  cups,
  grams_label,
  interactive,
  on_click,
}: props) {
  const level = clamp01(fill);
  const boiling = level > 0.02;
  const low = level > 0 && level < 0.25;
  const dim =
    size === 'fill' ? '100%' : size === 'lg' ? 152 : size === 'md' ? 112 : 82;
  const is_pot = kind === 'pot';
  const liquid =
    LIQUID[tone ?? (is_pot ? 'tapioca' : 'black_tea')];

  const shell = (
    <span
      className={`prep-obj ${is_pot ? 'prep-obj--pot' : 'prep-obj--thermos'} ${
        boiling ? 'prep-obj--boil' : ''
      } ${level <= 0 ? 'prep-obj--empty' : ''}`}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      {boiling
        ? [0, 1, 2].map((i) => (
            <span
              key={`st-${i}`}
              className="prep-obj__steam"
              style={{ left: `${28 + i * 18}%`, animationDelay: `${i * 0.32}s` }}
            />
          ))
        : null}

      {is_pot ? (
        <>
          <span className="prep-obj__handle prep-obj__handle--l" />
          <span className="prep-obj__handle prep-obj__handle--r" />
          <span className="prep-obj__rim" />
          <span className="prep-obj__body">
            <span
              className="prep-obj__fill"
              style={{
                height: `${level * 100}%`,
                background: liquid,
              }}
            >
              {boiling
                ? PEARLS.map((p, i) => (
                    <span
                      key={i}
                      className="prep-obj__pearl"
                      style={{
                        left: `${p.x}%`,
                        bottom: `${p.y}%`,
                        width: p.s,
                        height: p.s,
                        animationDelay: `${p.d}s`,
                      }}
                    />
                  ))
                : null}
              {boiling
                ? BUBBLES.map((b, i) => (
                    <span
                      key={`b${i}`}
                      className="prep-obj__bubble"
                      style={{
                        left: `${b.x}%`,
                        animationDelay: `${b.d}s`,
                        animationDuration: `${b.dur}s`,
                      }}
                    />
                  ))
                : null}
            </span>
            <span className="prep-obj__sheen" />
          </span>
          <span className="prep-obj__foot" />
        </>
      ) : (
        <>
          <span className="prep-obj__cap" />
          <span className="prep-obj__knob" />
          <span className="prep-obj__flask">
            <span className="prep-obj__stripe" />
            <span
              className="prep-obj__fill prep-obj__fill--flask"
              style={{
                height: `${level * 100}%`,
                background: liquid,
              }}
            >
              {boiling
                ? BUBBLES.map((b, i) => (
                    <span
                      key={`tb${i}`}
                      className="prep-obj__bubble"
                      style={{
                        left: `${b.x}%`,
                        animationDelay: `${b.d}s`,
                        animationDuration: `${b.dur}s`,
                      }}
                    />
                  ))
                : null}
            </span>
            <span className="prep-obj__sheen prep-obj__sheen--flask" />
          </span>
          <span className="prep-obj__stand" />
        </>
      )}

      <span className="prep-obj__pct">
        {Math.round(level * 100)}%
      </span>
    </span>
  );

  const caption =
    label || cups != null || grams_label ? (
      <span className="prep-obj__caption">
        {label ? <span className="prep-obj__name">{label}</span> : null}
        <span className={`prep-obj__stat ${level <= 0 ? 'empty' : low ? 'low' : ''}`}>
          {level <= 0 ? 'пусто' : cups != null ? `${cups} ст` : `${Math.round(level * 100)}%`}
        </span>
        {grams_label ? <span className="prep-obj__g">{grams_label}</span> : null}
      </span>
    ) : null;

  const wrap_class =
    size === 'fill' ? 'prep-obj-wrap prep-obj-wrap--fill' : 'prep-obj-wrap';
  const btn_class = size === 'fill' ? 'prep-obj-btn prep-obj-btn--fill' : 'prep-obj-btn';

  if (!interactive) {
    return (
      <span className={wrap_class}>
        {shell}
        {caption}
      </span>
    );
  }

  return (
    <button type="button" onClick={on_click} className={btn_class}>
      {shell}
      {caption}
    </button>
  );
}

/** плотные кастрюля / термос без плашки — как предмет на столе */
export const PREP_VESSEL_CSS = `
.prep-obj-btn {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.prep-obj-btn:hover { transform: translateY(-2px) scale(1.03); }
.prep-obj-btn:active { transform: scale(0.97); }
.prep-obj-btn--fill,
.prep-obj-wrap--fill {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.prep-obj-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.prep-obj-wrap--fill .prep-obj,
.prep-obj-btn--fill .prep-obj {
  width: 100% !important;
  height: 100% !important;
}
.prep-obj {
  position: relative;
  display: block;
  filter: drop-shadow(0 8px 6px rgba(0,0,0,0.28)) drop-shadow(0 2px 2px rgba(0,0,0,0.2));
}
.prep-obj--empty { filter: drop-shadow(0 6px 4px rgba(0,0,0,0.2)) grayscale(0.15); }
.prep-obj--boil .prep-obj__body,
.prep-obj--boil .prep-obj__flask {
  animation: prep-simmer 1.6s ease-in-out infinite;
}

/* кастрюля — матовый металл */
.prep-obj__body {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 28%;
  bottom: 12%;
  border-radius: 12% 12% 32% 32% / 10% 10% 42% 42%;
  background: linear-gradient(180deg, #C8C2B8 0%, #8F877C 38%, #5A534C 100%);
  border: 2px solid #3D3832;
  box-shadow:
    inset 0 3px 0 #E8E4DC,
    inset 0 -8px 12px rgba(0,0,0,0.35);
  overflow: hidden;
  transform-origin: 50% 90%;
}
.prep-obj__rim {
  position: absolute;
  left: 11%;
  right: 11%;
  top: 22%;
  height: 12%;
  z-index: 3;
  border-radius: 50%;
  background: linear-gradient(180deg, #EDE8E0 0%, #9A9288 55%, #6A635C 100%);
  border: 2px solid #3D3832;
  box-shadow: inset 0 2px 0 #FFF;
}
.prep-obj__foot {
  position: absolute;
  left: 28%;
  right: 28%;
  bottom: 6%;
  height: 8%;
  border-radius: 0 0 40% 40%;
  background: linear-gradient(180deg, #8A8278, #4A453F);
  border: 2px solid #3D3832;
  border-top: 0;
}
.prep-obj__handle {
  position: absolute;
  top: 42%;
  width: 14%;
  height: 22%;
  border: 3px solid #4A453F;
  background: #8F877C;
  box-shadow: inset 0 1px 0 #C8C2B8;
  z-index: 0;
}
.prep-obj__handle--l {
  left: 2%;
  border-right-width: 2px;
  border-radius: 60% 12% 12% 60%;
}
.prep-obj__handle--r {
  right: 2%;
  border-left-width: 2px;
  border-radius: 12% 60% 60% 12%;
}

/* термос — плотный цилиндр */
.prep-obj__flask {
  position: absolute;
  left: 22%;
  right: 22%;
  top: 24%;
  bottom: 10%;
  border-radius: 18px;
  background: linear-gradient(90deg, #A8A094 0%, #D4CFC6 22%, #8E867C 55%, #5C564E 100%);
  border: 2px solid #3D3832;
  box-shadow: inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -6px 10px rgba(0,0,0,0.3);
  overflow: hidden;
  transform-origin: 50% 90%;
}
.prep-obj__stripe {
  position: absolute;
  left: 0;
  right: 0;
  top: 36%;
  height: 12%;
  z-index: 2;
  background: linear-gradient(180deg, #5C564E, #2E2A26);
  border-top: 1px solid #8A8278;
  border-bottom: 1px solid #1A1816;
}
.prep-obj__cap {
  position: absolute;
  left: 24%;
  right: 24%;
  top: 12%;
  height: 14%;
  z-index: 3;
  border-radius: 10px 10px 4px 4px;
  background: linear-gradient(180deg, #E8E4DC, #7A736A);
  border: 2px solid #3D3832;
}
.prep-obj__knob {
  position: absolute;
  left: 42%;
  right: 42%;
  top: 5%;
  height: 10%;
  z-index: 4;
  border-radius: 6px;
  background: linear-gradient(180deg, #D4CFC6, #5C564E);
  border: 2px solid #3D3832;
}
.prep-obj__stand {
  position: absolute;
  left: 26%;
  right: 26%;
  bottom: 4%;
  height: 9%;
  border-radius: 0 0 10px 10px;
  background: linear-gradient(180deg, #8A8278, #3D3832);
  border: 2px solid #3D3832;
  border-top: 0;
}

.prep-obj__fill {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: 5%;
  border-radius: 8% 8% 26% 26% / 6% 6% 36% 36%;
  transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
  z-index: 1;
}
.prep-obj__fill--flask {
  left: 8%;
  right: 8%;
  bottom: 4%;
  border-radius: 10px;
}
.prep-obj__sheen {
  position: absolute;
  left: 10%;
  top: 18%;
  width: 22%;
  height: 55%;
  border-radius: 40%;
  background: linear-gradient(180deg, rgba(255,255,255,0.55), transparent);
  z-index: 2;
  pointer-events: none;
}
.prep-obj__sheen--flask {
  left: 12%;
  width: 18%;
  height: 70%;
  background: linear-gradient(180deg, rgba(255,255,255,0.65), transparent 70%);
}

.prep-obj__pearl {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 28%, #7A4E30, #1A0C06 70%);
  box-shadow: 0 1px 1px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.25);
  animation: prep-pearl 2s ease-in-out infinite;
}
.prep-obj__bubble {
  position: absolute;
  bottom: 8%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.35);
  animation-name: prep-bubble;
  animation-timing-function: ease-out;
  animation-iteration-count: infinite;
}
.prep-obj__steam {
  position: absolute;
  top: 2%;
  width: 10px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255,255,255,0.55);
  filter: blur(2px);
  animation: prep-steam 1.9s ease-out infinite;
  z-index: 6;
  pointer-events: none;
}
.prep-obj__pct {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding-top: 16%;
  font-size: 0.82em;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #FFFFFF;
  text-shadow:
    0 0 2px rgba(0,0,0,0.9),
    0 1px 2px rgba(0,0,0,0.85),
    0 0 8px rgba(0,0,0,0.45);
  pointer-events: none;
}

.prep-obj__caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
  text-align: center;
}
.prep-obj__name {
  font-size: 11px;
  font-weight: 700;
  color: #1F1A16;
  text-shadow: 0 1px 0 #fff, 0 0 6px #fff;
}
.prep-obj__stat {
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #C45C26;
  text-shadow: 0 1px 0 #fff, 0 0 6px #fff;
}
.prep-obj__stat.empty { color: #7A736A; }
.prep-obj__stat.low { color: #D97706; }
.prep-obj__g {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: #4A453F;
  text-shadow: 0 1px 0 #fff;
}

@keyframes prep-simmer {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes prep-pearl {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(2px, -3px); }
}
@keyframes prep-bubble {
  0% { opacity: 0; transform: translateY(0) scale(0.4); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-30px) scale(1.1); }
}
@keyframes prep-steam {
  0% { opacity: 0; transform: translateY(8px) scale(0.7); }
  40% { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-14px) scale(1.2); }
}
`;
