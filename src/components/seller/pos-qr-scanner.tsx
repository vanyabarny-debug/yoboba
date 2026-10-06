'use client';

import { useEffect, useRef, useState } from 'react';
import { parse_pickup_code_input } from '@/lib/pickup-code';

type props = {
  open: boolean;
  on_close: () => void;
  on_scan: (code: string) => void;
};

type barcode_detector_like = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

export default function pos_qr_scanner({ open, on_close, on_scan }: props) {
  const video_ref = useRef<HTMLVideoElement | null>(null);
  const stream_ref = useRef<MediaStream | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [supported, set_supported] = useState(true);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let raf = 0;
    let detector: barcode_detector_like | null = null;

    async function start() {
      set_error(null);
      const BD = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => barcode_detector_like }).BarcodeDetector;
      if (!BD) {
        set_supported(false);
        set_error('сканер QR на этом планшете не поддерживается — введите код цифрами');
        return;
      }
      try {
        detector = new BD({ formats: ['qr_code'] });
      } catch {
        set_supported(false);
        set_error('сканер QR недоступен — введите код цифрами');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream_ref.current = stream;
        const video = video_ref.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
      } catch {
        if (!cancelled) set_error('нет доступа к камере');
        return;
      }

      const tick = async () => {
        if (cancelled || !detector || !video_ref.current) return;
        const video = video_ref.current;
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            for (const c of codes) {
              const parsed = parse_pickup_code_input(c.rawValue || '');
              if (parsed) {
                on_scan(parsed);
                on_close();
                return;
              }
            }
          } catch {
            /* ignore frame errors */
          }
        }
        raf = window.requestAnimationFrame(() => {
          void tick();
        });
      };
      raf = window.requestAnimationFrame(() => {
        void tick();
      });
    }

    void start();

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      stream_ref.current?.getTracks().forEach((t) => t.stop());
      stream_ref.current = null;
    };
  }, [open, on_close, on_scan]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4">
      <div className="relative w-full sm:max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl bg-neutral-950 text-white shadow-soft">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">сканер кода гостя</p>
          <button
            type="button"
            onClick={on_close}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium"
          >
            закрыть
          </button>
        </div>
        {supported ? (
          <div className="relative aspect-[3/4] w-full bg-black">
            <video
              ref={video_ref}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-2xl border-2 border-white/70" />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="px-4 py-4 text-sm text-amber-200">{error}</p>
        ) : (
          <p className="px-4 py-3 text-xs text-white/60">наведите камеру на QR в приложении гостя</p>
        )}
      </div>
    </div>
  );
}
