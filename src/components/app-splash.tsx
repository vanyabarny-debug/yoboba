'use client';

import { useEffect, useRef, useState } from 'react';
import BrandWordmark from '@/components/brand-wordmark';

// тайминги композиции:
const SWAP_AT = 3100; // текст свапается: логотип уезжает влево, справа въезжает слоган
const EXIT_AT = 4900; // вся заставка растворяется в прозрачность
const REMOVE_AT = 5600; // убираем из DOM

type pearl = { x: number; y: number; vx: number; vy: number; r: number };
type rect = { left: number; right: number; top: number; bottom: number };
type collider = { r: rect; bounce: number };

/** детерминированный ГПСЧ — одинаковая картина при каждой загрузке */
function make_rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export default function app_splash() {
  const [removed, set_removed] = useState(false);
  const [phase, set_phase] = useState<'run' | 'swap' | 'exit'>('run');
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const logo_ref = useRef<HTMLDivElement>(null);
  const phase_ref = useRef<'run' | 'swap' | 'exit'>('run');

  useEffect(() => {
    phase_ref.current = phase;
  }, [phase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const t_swap = setTimeout(() => set_phase('swap'), SWAP_AT);
    const t_exit = setTimeout(() => set_phase('exit'), EXIT_AT);
    const t_remove = setTimeout(() => set_removed(true), REMOVE_AT);

    return () => {
      clearTimeout(t_swap);
      clearTimeout(t_exit);
      clearTimeout(t_remove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvas_ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const rng = make_rng(20260718);
    const pearls: pearl[] = [];

    const TOTAL = W < 420 ? 26 : 34;
    const SPAWN_EVERY = 46; // мс между появлениями
    let spawned = 0;
    let spawn_acc = 0;

    const GRAV = 2200; // px/с² в воздухе
    const GRAV_LIQUID = 1150; // тонет в молоке (тапиока плотнее)
    const LIQ_DRAG = 0.94; // вязкость молока
    const TURB = 7; // турбулентность в жидкости
    const REST = 0.14;
    const FLOOR_REST = 0.16;
    const FRICTION = 0.9;

    const FILL_MS = 3500; // за сколько наливается молоко
    const TARGET_TOP = H * 0.05; // до какого уровня (почти до верха)
    const WAVE_AMP = 6;

    let sim_start = 0;
    let surface_base = H; // текущий уровень молока (сверху вниз)

    const PEARL_R = 20; // все шарики одного размера

    function spawn() {
      const r = PEARL_R;
      // сыпем по краям (внешние ~трети), чтобы на логотип попадали только по краям
      const side = rng() < 0.5 ? 0 : 1;
      let x =
        side === 0
          ? r + rng() * (W * 0.34)
          : W - r - rng() * (W * 0.34);
      x = Math.max(r, Math.min(W - r, x));
      pearls.push({ x, y: -r - rng() * 60, vx: (rng() - 0.5) * 30, vy: 60 + rng() * 80, r });
    }

    // прямоугольник логотипа (по реальным буквам)
    function logo_rect(): rect | null {
      const span = logo_ref.current?.firstElementChild as HTMLElement | null;
      if (!span) return null;
      const r = span.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return {
        left: r.left + r.width * 0.01,
        right: r.right - r.width * 0.01,
        top: r.top + r.height * 0.24, // полка ровно по верху букв
        bottom: r.bottom - r.height * 0.1,
      };
    }

    // плотные коллайдеры: логотип и подпись как твёрдые препятствия (всегда).
    // у логотипа почти нулевой отскок — шарики не подпрыгивают, а скользят
    function get_colliders(): collider[] {
      const out: collider[] = [];
      // после свапа логотип уезжает — снимаем его коллайдер, чтобы он не тащил
      // за собой шарики (слоган коллайдером не является вовсе)
      if (phase_ref.current !== 'run') return out;
      const logo = logo_rect();
      if (logo) out.push({ r: logo, bounce: 0.02 });
      return out;
    }

    function resolve_rect(p: pearl, r: rect, bounce: number) {
      const cx = Math.max(r.left, Math.min(p.x, r.right));
      const cy = Math.max(r.top, Math.min(p.y, r.bottom));
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy > p.r * p.r) return;
      const d = Math.sqrt(dx * dx + dy * dy);
      let nx: number;
      let ny: number;
      let pen: number;
      if (d > 0.0001) {
        nx = dx / d;
        ny = dy / d;
        pen = p.r - d;
      } else {
        nx = 0;
        ny = -1;
        pen = p.r + (p.y - r.top);
      }
      p.x += nx * pen;
      p.y += ny * pen;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= (1 + bounce) * vn * nx;
        p.vy -= (1 + bounce) * vn * ny;
      }
      if (ny < -0.5) p.vx *= FRICTION;
    }

    function resolve_collisions(cols: collider[]) {
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < pearls.length; i++) {
          const a = pearls[i];
          for (let j = i + 1; j < pearls.length; j++) {
            const b = pearls[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min_d = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min_d * min_d || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const overlap = min_d - d;
            const ma = a.r * a.r;
            const mb = b.r * b.r;
            const tot = ma + mb;
            a.x -= nx * overlap * (mb / tot);
            a.y -= ny * overlap * (mb / tot);
            b.x += nx * overlap * (ma / tot);
            b.y += ny * overlap * (ma / tot);
            const vel_n = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vel_n < 0) {
              const imp = (-(1 + REST) * vel_n) / (1 / ma + 1 / mb);
              a.vx -= (imp * nx) / ma;
              a.vy -= (imp * ny) / ma;
              b.vx += (imp * nx) / mb;
              b.vy += (imp * ny) / mb;
            }
          }
        }
        for (const p of pearls) {
          if (p.x - p.r < 0) {
            p.x = p.r;
            if (p.vx < 0) p.vx = -p.vx * FLOOR_REST;
          }
          if (p.x + p.r > W) {
            p.x = W - p.r;
            if (p.vx > 0) p.vx = -p.vx * FLOOR_REST;
          }
          if (p.y + p.r > H) {
            p.y = H - p.r;
            if (p.vy > 0) p.vy = -p.vy * FLOOR_REST;
            p.vx *= FRICTION;
          }
          for (const c of cols) resolve_rect(p, c.r, c.bounce);
        }
      }
    }

    function surface_at(x: number, time: number) {
      return surface_base + Math.sin(x * 0.018 + time * 2.2) * WAVE_AMP;
    }

    function draw_milk(time: number, prog: number) {
      // тело молока с волнистой поверхностью
      ctx!.beginPath();
      ctx!.moveTo(0, H);
      ctx!.lineTo(0, surface_at(0, time));
      for (let x = 0; x <= W; x += 8) ctx!.lineTo(x, surface_at(x, time));
      ctx!.lineTo(W, H);
      ctx!.closePath();
      ctx!.fillStyle = 'rgba(255,255,255,0.95)';
      ctx!.fill();

      // блик на поверхности
      ctx!.beginPath();
      ctx!.moveTo(0, surface_at(0, time));
      for (let x = 0; x <= W; x += 8) ctx!.lineTo(x, surface_at(x, time));
      ctx!.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx!.lineWidth = 3;
      ctx!.stroke();

      // струя молока сверху по центру, пока наливается
      if (prog < 0.97) {
        const cx = W * 0.5;
        const sw = 11 + Math.sin(time * 8) * 1.5;
        ctx!.fillStyle = 'rgba(255,255,255,0.95)';
        ctx!.beginPath();
        ctx!.moveTo(cx - sw / 2, 0);
        ctx!.lineTo(cx + sw / 2, 0);
        ctx!.lineTo(cx + sw / 2 + 2, surface_base);
        ctx!.lineTo(cx - sw / 2 - 2, surface_base);
        ctx!.closePath();
        ctx!.fill();
        // всплеск у поверхности
        ctx!.beginPath();
        ctx!.ellipse(cx, surface_base, sw * 1.6, sw * 0.7, 0, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function draw_pearl(p: pearl) {
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx!.fillStyle = '#2e1c0f';
      ctx!.fill();
    }

    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      if (!sim_start) sim_start = now;
      const elapsed = now - sim_start;
      const time = elapsed / 1000;

      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.033) dt = 0.033;

      const prog = Math.min(elapsed / FILL_MS, 1);
      const eased = 1 - (1 - prog) * (1 - prog);
      surface_base = H - eased * (H - TARGET_TOP);

      spawn_acc += dt * 1000;
      while (spawn_acc >= SPAWN_EVERY && spawned < TOTAL) {
        spawn();
        spawned++;
        spawn_acc -= SPAWN_EVERY;
      }

      for (const p of pearls) {
        const surf = surface_at(p.x, time);
        if (p.y > surf) {
          // в молоке — вязкость, замедленное погружение, турбулентность
          p.vy += GRAV_LIQUID * dt;
          p.vx *= LIQ_DRAG;
          p.vy *= LIQ_DRAG;
          p.vx += (rng() - 0.5) * TURB;
        } else {
          p.vy += GRAV * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      resolve_collisions(get_colliders());

      // соскальзывание с логотипа — только пока он на месте (до свапа)
      if (phase_ref.current === 'run') {
        const logo = logo_rect();
        if (logo) {
          const cx = (logo.left + logo.right) / 2;
          for (const p of pearls) {
            const on_top =
              p.x > logo.left - p.r &&
              p.x < logo.right + p.r &&
              Math.abs(p.y + p.r - logo.top) < 8;
            if (on_top) {
              const dir = p.x < cx ? -1 : 1;
              p.vx += dir * 1500 * dt; // боковое ускорение — соскальзывает сразу
            }
          }
        }
      }

      ctx!.clearRect(0, 0, W, H);
      draw_milk(time, prog);
      for (const p of pearls) draw_pearl(p);

      raf = requestAnimationFrame(frame);
    }

    function on_resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.scale(dpr, dpr);
    }
    window.addEventListener('resize', on_resize);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', on_resize);
    };
  }, []);

  if (removed) return null;

  return (
    <div
      className={`app-splash ${phase !== 'run' ? 'is-swap' : ''} ${phase === 'exit' ? 'is-exit' : ''}`}
      role="status"
      aria-label="загрузка приложения"
      aria-hidden={phase !== 'run'}
    >
      <canvas ref={canvas_ref} className="app-splash-canvas" aria-hidden="true" />

      <div className="app-splash-content">
        <div ref={logo_ref} className="app-splash-logo">
          <BrandWordmark className="text-[72px]" />
        </div>
        <p className="app-splash-slogan">
          радость,
          <br />
          которую ты заслуживаешь
        </p>
      </div>
    </div>
  );
}
