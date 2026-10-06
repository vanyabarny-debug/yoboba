'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { parse_pickup_code_input } from '@/lib/pickup-code';

type props = {
  open: boolean;
  on_close: () => void;
  on_scan: (code: string) => void;
};

const CAMERA_OK_KEY = 'yoboba_pos_camera_ok';

type camera_permission = 'unknown' | 'prompt' | 'granted' | 'denied';

function is_ios() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function is_android() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function remember_camera_ok() {
  try {
    sessionStorage.setItem(CAMERA_OK_KEY, '1');
  } catch {
    /* ignore */
  }
}

function had_camera_ok() {
  try {
    return sessionStorage.getItem(CAMERA_OK_KEY) === '1';
  } catch {
    return false;
  }
}

function is_permission_denied(err: unknown): boolean {
  if (!err) return false;
  const name =
    err instanceof DOMException
      ? err.name
      : typeof err === 'object' && err && 'name' in err
        ? String((err as { name?: string }).name)
        : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    /not allowed|permission denied|permission/i.test(msg)
  );
}

async function read_camera_permission(): Promise<camera_permission> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
    });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

/** жёстко гасим все video-треки, если html5-qrcode не успел */
function hard_stop_media(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('video').forEach((video) => {
    const stream = video.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    video.srcObject = null;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
  });
}

export default function pos_qr_scanner({ open, on_close, on_scan }: props) {
  const region_id = useId().replace(/:/g, '');
  const region_ref = useRef<HTMLDivElement | null>(null);
  const scanner_ref = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const starting_ref = useRef(false);
  const open_ref = useRef(open);
  const on_close_ref = useRef(on_close);
  const on_scan_ref = useRef(on_scan);

  const [error, set_error] = useState<string | null>(null);
  const [permission_denied, set_permission_denied] = useState(false);
  const [starting, set_starting] = useState(false);
  const [camera_active, set_camera_active] = useState(false);
  /** только если ещё не давали доступ в этой сессии */
  const [need_tap, set_need_tap] = useState(true);
  const [show_settings_hint, set_show_settings_hint] = useState(false);

  open_ref.current = open;
  on_close_ref.current = on_close;
  on_scan_ref.current = on_scan;

  const stop_scanner = useCallback(async () => {
    const scanner = scanner_ref.current;
    scanner_ref.current = null;
    if (scanner) {
      try {
        const state = typeof scanner.getState === 'function' ? scanner.getState() : 2;
        // 2 = SCANNING, 3 = PAUSED (html5-qrcode Html5QrcodeScannerState)
        if (state === 2 || state === 3) {
          await scanner.stop();
        }
      } catch {
        try {
          await scanner.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
    hard_stop_media(document.getElementById(region_id));
    hard_stop_media(region_ref.current);
    set_camera_active(false);
  }, [region_id]);

  const start_camera = useCallback(async () => {
    if (!open_ref.current || starting_ref.current) return;
    starting_ref.current = true;

    set_error(null);
    set_permission_denied(false);
    set_show_settings_hint(false);
    set_starting(true);

    await stop_scanner();
    if (!open_ref.current) {
      starting_ref.current = false;
      set_starting(false);
      return;
    }

    set_starting(true);

    const { Html5Qrcode } = await import('html5-qrcode');
    if (!open_ref.current) {
      starting_ref.current = false;
      set_starting(false);
      return;
    }

    const scanner = new Html5Qrcode(region_id, { verbose: false });
    scanner_ref.current = scanner;

    const on_decoded = (raw: string) => {
      const parsed = parse_pickup_code_input(raw);
      if (!parsed) return;
      remember_camera_ok();
      void (async () => {
        await stop_scanner();
        on_scan_ref.current(parsed);
        on_close_ref.current();
      })();
    };

    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1,
    };

    const try_start = async (facing: 'environment' | 'user') => {
      await scanner.start({ facingMode: facing }, config, on_decoded, () => {});
    };

    try {
      try {
        await try_start('environment');
      } catch (first) {
        if (is_permission_denied(first)) throw first;
        if (!open_ref.current) throw first;
        await try_start('user');
      }

      if (!open_ref.current) {
        await stop_scanner();
        return;
      }

      remember_camera_ok();
      set_camera_active(true);
      set_need_tap(false);
      set_starting(false);
      starting_ref.current = false;
    } catch (err) {
      await stop_scanner();
      starting_ref.current = false;
      set_starting(false);
      set_camera_active(false);

      if (!open_ref.current) return;

      if (is_permission_denied(err)) {
        const perm = await read_camera_permission();
        set_permission_denied(true);
        set_need_tap(true);
        if (perm === 'denied') {
          set_error('доступ к камере запрещён — включите его в настройках браузера');
          set_show_settings_hint(true);
        } else {
          set_error('нужен доступ к камере — нажмите «включить камеру»');
        }
        return;
      }

      set_need_tap(true);
      set_error('не удалось включить камеру — попробуйте ещё раз или введите код цифрами');
    }
  }, [region_id, stop_scanner]);

  // открытие / закрытие модалки — единственный триггер камеры
  useEffect(() => {
    if (!open) {
      starting_ref.current = false;
      void stop_scanner();
      set_starting(false);
      set_error(null);
      set_permission_denied(false);
      set_show_settings_hint(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const perm = await read_camera_permission();
      if (cancelled || !open_ref.current) return;

      // уже давали доступ в этой вкладке — не показываем кнопку снова
      const can_auto = perm === 'granted' || had_camera_ok();
      if (can_auto) {
        set_need_tap(false);
        await start_camera();
      } else {
        set_need_tap(true);
        set_camera_active(false);
      }
    })();

    return () => {
      cancelled = true;
      starting_ref.current = false;
      void stop_scanner();
      set_starting(false);
    };
  }, [open, start_camera, stop_scanner]);

  // на всякий случай — при размонтировании
  useEffect(() => {
    return () => {
      void stop_scanner();
    };
  }, [stop_scanner]);

  if (!open) return null;

  const settings_steps = is_ios()
    ? 'Настройки → Safari (или Chrome) → Камера → «Разрешить». Затем вернитесь и нажмите «включить камеру».'
    : is_android()
      ? 'Замок / «i» слева от адреса → Разрешения → Камера → Разрешить.'
      : 'В адресной строке откройте настройки сайта и разрешите камеру.';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4">
      <div className="relative w-full sm:max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl bg-neutral-950 text-white shadow-soft">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">сканер кода гостя</p>
          <button
            type="button"
            onClick={() => {
              void stop_scanner().then(() => on_close_ref.current());
            }}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium"
          >
            закрыть
          </button>
        </div>

        <div ref={region_ref} className="relative w-full min-h-[280px] bg-black overflow-hidden">
          {starting ? (
            <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-white/70">
              включаем камеру…
            </p>
          ) : null}

          {need_tap && !camera_active && !starting ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-neutral-950/95 px-6 text-center">
              <p className="text-sm text-white/80">
                для сканирования QR нужен доступ к камере
              </p>
              <button
                type="button"
                onClick={() => void start_camera()}
                className="w-full max-w-xs rounded-pill bg-accent py-3.5 text-sm font-semibold text-white"
              >
                включить камеру
              </button>
              {error ? <p className="text-xs text-amber-200">{error}</p> : null}
              {show_settings_hint ? (
                <div className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-left">
                  <p className="text-xs font-semibold text-white/90">как включить в настройках</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-white/65">{settings_steps}</p>
                </div>
              ) : permission_denied ? (
                <button
                  type="button"
                  onClick={() => set_show_settings_hint(true)}
                  className="text-xs font-medium text-white/70 underline underline-offset-2"
                >
                  камера заблокирована — как включить
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            id={region_id}
            className={`w-full [&_video]:object-cover ${need_tap && !camera_active ? 'invisible h-0 min-h-0' : ''}`}
          />
        </div>

        {camera_active ? (
          <p className="px-4 py-3 text-xs text-white/60">наведите камеру на QR в приложении гостя</p>
        ) : null}
      </div>
    </div>
  );
}
