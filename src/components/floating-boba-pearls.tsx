'use client';

import { useEffect, useRef } from 'react';

type pearl = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  shade: number;
};

const PEARL_COUNT = 14;

/** плавающие шарики тапиоки в полости баннера — уезжают от курсора */
export default function floating_boba_pearls({
  className = '',
}: {
  className?: string;
}) {
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const pearls_ref = useRef<pearl[]>([]);
  const mouse_ref = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const raf_ref = useRef(0);

  useEffect(() => {
    const canvas = canvas_ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    function resize() {
      const rect = parent!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas!.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: rect.width, h: rect.height };
    }

    let { w, h } = resize();

    if (pearls_ref.current.length === 0) {
      pearls_ref.current = Array.from({ length: PEARL_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 5 + Math.random() * 7,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        shade: 0.35 + Math.random() * 0.45,
      }));
    }

    function on_move(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse_ref.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: true,
      };
    }
    function on_leave() {
      mouse_ref.current.inside = false;
    }

    parent.addEventListener('pointermove', on_move);
    parent.addEventListener('pointerleave', on_leave);

    const ro = new ResizeObserver(() => {
      ({ w, h } = resize());
    });
    ro.observe(parent);

    function tick() {
      const pearls = pearls_ref.current;
      const mouse = mouse_ref.current;
      ctx!.clearRect(0, 0, w, h);

      for (const p of pearls) {
        if (mouse.inside) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy) || 1;
          const force = Math.max(0, 90 - dist) / 90;
          p.vx += (dx / dist) * force * 0.55;
          p.vy += (dy / dist) * force * 0.55;
        }

        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < p.r) {
          p.x = p.r;
          p.vx *= -0.8;
        }
        if (p.x > w - p.r) {
          p.x = w - p.r;
          p.vx *= -0.8;
        }
        if (p.y < p.r) {
          p.y = p.r;
          p.vy *= -0.8;
        }
        if (p.y > h - p.r) {
          p.y = h - p.r;
          p.vy *= -0.8;
        }

        const g = ctx!.createRadialGradient(
          p.x - p.r * 0.3,
          p.y - p.r * 0.35,
          p.r * 0.15,
          p.x,
          p.y,
          p.r
        );
        g.addColorStop(0, `rgba(255, 236, 210, ${0.55 + p.shade * 0.35})`);
        g.addColorStop(0.45, `rgba(92, 52, 28, ${0.55 + p.shade * 0.3})`);
        g.addColorStop(1, `rgba(35, 18, 10, ${0.75 + p.shade * 0.2})`);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = g;
        ctx!.fill();
        ctx!.beginPath();
        ctx!.arc(p.x - p.r * 0.28, p.y - p.r * 0.32, p.r * 0.22, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(255,255,255,0.35)';
        ctx!.fill();
      }

      raf_ref.current = requestAnimationFrame(tick);
    }

    raf_ref.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf_ref.current);
      parent.removeEventListener('pointermove', on_move);
      parent.removeEventListener('pointerleave', on_leave);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvas_ref}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
