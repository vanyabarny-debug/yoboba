'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { parse_pickup_code_input } from '@/lib/pickup-code';

type props = {
  open: boolean;
  on_close: () => void;
  on_scan: (code: string) => void;
};

type camera_permission = 'unknown' | 'prompt' | 'granted' | 'denied';

function is_ios() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function is_android() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
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

export default function pos_qr_scanner({ open, on_close, on_scan }: props) {
  const region_id = useId().replace(/:/g, '');
  const scanner_ref = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [permission_denied, set_permission_denied] = useState(false);
  const [starting, set_starting] = useState(false);
  /** камера уже включена и идёт скан */
  const [camera_active, set_camera_active] = useState(false);
  /** нужен явный тап — иначе iOS не покажет системный запрос */
  const [need_tap, set_need_tap] = useState(true);
  const [show_settings_hint, set_show_settings_hint] = useState(false);

  const stop_scanner = useCallback(async () => {
    const scanner = scanner_ref.current;
    scanner_ref.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      /* already stopped */
    }
  }, []);

  const start_camera = useCallback(async () => {
    set_error(null);
    set_permission_denied(false);
    set_show_settings_hint(false);
    set_starting(true);

    await stop_scanner();

    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode(region_id, { verbose: false });
    scanner_ref.current = scanner;

    const on_decoded = (raw: string) => {
      const parsed = parse_pickup_code_input(raw);
      if (!parsed) return;
      void stop_scanner();
      on_scan(parsed);
      on_close();
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
        await try_start('user');
      }
      set_camera_active(true);
      set_need_tap(false);
      set_starting(false);
    } catch (err) {
      await stop_scanner();
      set_starting(false);
      set_camera_active(false);

      if (is_permission_denied(err)) {
        const perm = await read_camera_permission();
        set_permission_denied(true);
        set_need_tap(true);
        if (perm === 'denied') {
          set_error('доступ к камере запрещён — включите его в настройках браузера');
          set_show_settings_hint(true);
        } else {
          set_error('нужен доступ к камере — нажмите «разрешить камеру»');
        }
        return;
      }

      set_error('не удалось включить камеру — попробуйте ещё раз или введите код цифрами');
    }
  }, [on_close, on_scan, region_id, stop_scanner]);

  useEffect(() => {
    if (!open) return;

    set_error(null);
    set_permission_denied(false);
    set_show_settings_hint(false);
    set_camera_active(false);
    set_need_tap(true);

    void (async () => {
      const perm = await read_camera_permission();
      if (perm === 'granted') {
        set_need_tap(false);
        await start_camera();
      }
    })();

    return () => {
      void stop_scanner();
    };
  }, [open, start_camera, stop_scanner]);

  if (!open) return null;

  const settings_steps = is_ios()
    ? 'Настройки → Safari (или Chrome) → Камера → «Спросить» или «Разрешить». Затем вернитесь на сайт и нажмите «разрешить камеру».'
    : is_android()
      ? 'Нажмите замок или «i» слева от адреса сайта → Разрешения → Камера → Разрешить. Или: Настройки Android → Приложения → браузер → Разрешения → Камера.'
      : 'В адресной строке откройте настройки сайта и разрешите камеру для этого адреса.';

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

        <div className="relative w-full min-h-[280px] bg-black overflow-hidden">
          {starting ? (
            <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-white/70">
              включаем камеру…
            </p>
          ) : null}

          {need_tap && !camera_active ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-neutral-950/95 px-6 text-center">
              <p className="text-sm text-white/80">
                для сканирования QR нужен доступ к камере
              </p>
              <button
                type="button"
                onClick={() => void start_camera()}
                className="w-full max-w-xs rounded-pill bg-accent py-3.5 text-sm font-semibold text-white"
              >
                разрешить камеру
              </button>
              {error ? (
                <p className="text-xs text-amber-200">{error}</p>
              ) : null}
              {show_settings_hint ? (
                <div className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-left">
                  <p className="text-xs font-semibold text-white/90">как включить в настройках</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-white/65">{settings_steps}</p>
                  <p className="mt-2 text-[11px] text-white/50">
                    после изменения настроек вернитесь сюда и снова нажмите «разрешить камеру»
                  </p>
                </div>
              ) : permission_denied ? (
                <button
                  type="button"
                  onClick={() => set_show_settings_hint(true)}
                  className="text-xs font-medium text-white/70 underline underline-offset-2"
                >
                  камера заблокирована — как включить в настройках
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            id={region_id}
            className={`w-full [&_video]:object-cover ${need_tap && !camera_active ? 'invisible h-0 min-h-0' : ''}`}
          />
        </div>

        {error && camera_active ? (
          <p className="px-4 py-3 text-sm text-amber-200">{error}</p>
        ) : camera_active ? (
          <p className="px-4 py-3 text-xs text-white/60">наведите камеру на QR в приложении гостя</p>
        ) : null}

        {error && permission_denied && camera_active === false && !need_tap ? (
          <div className="px-4 pb-4 space-y-2">
            <button
              type="button"
              onClick={() => void start_camera()}
              className="w-full rounded-pill bg-accent py-3 text-sm font-semibold text-white"
            >
              запросить доступ снова
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
