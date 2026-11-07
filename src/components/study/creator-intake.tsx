'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import Topbar from '@/components/study/topbar';
import {
  empty_apply,
  intern_phone,
  intern_phone_tel,
  load_apply,
  save_apply,
  type Apply,
  type ApplyWork,
} from '@/lib/study/apply';

const max_works = 5;

async function compress_image(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1100;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('не получилось прочитать фото');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let url = canvas.toDataURL('image/jpeg', 0.72);
  if (url.length > 900_000) url = canvas.toDataURL('image/jpeg', 0.5);
  if (url.length > 1_100_000) throw new Error('фото слишком большое');
  return url;
}

export default function CreatorIntake() {
  const router = useRouter();
  const file_ref = useRef<HTMLInputElement>(null);
  const [apply, set_apply] = useState<Apply>({ ...empty_apply, role: 'creator' });
  const [i, set_i] = useState(0);
  const [error, set_error] = useState('');
  const [ready, set_ready] = useState(false);
  const [sending, set_sending] = useState(false);
  const [reading, set_reading] = useState(false);

  const total = 5;
  const done = i >= 4;

  const hydrated = useHydrated();
  if (hydrated && !ready) {
    set_ready(true);
    const saved = load_apply();
    if (saved?.role === 'creator') set_apply(saved);
  }

  const [error_step, set_error_step] = useState(i);
  if (error_step !== i) {
    set_error_step(i);
    set_error('');
  }

  const can_next = useMemo(() => {
    if (done) return true;
    if (i === 0) return apply.name.trim().length >= 2;
    if (i === 1) return apply.phone.replace(/\D/g, '').length >= 10;
    if (i === 2) return apply.city.trim().length >= 2;
    if (i === 3) return apply.works.length > 0;
    return false;
  }, [done, i, apply]);

  function validate(): string | null {
    if (i === 0 && apply.name.trim().length < 2) return 'напиши имя';
    if (i === 1 && apply.phone.replace(/\D/g, '').length < 10) return 'проверь телефон';
    if (i === 2 && apply.city.trim().length < 2) return 'укажи город';
    if (i === 3 && apply.works.length === 0) return 'прикрепи хотя бы одно фото';
    return null;
  }

  async function add_files(list: FileList | null) {
    if (!list?.length) return;
    const room = max_works - apply.works.length;
    if (room <= 0) {
      set_error('не больше 5 фото');
      return;
    }
    set_reading(true);
    set_error('');
    const next: ApplyWork[] = [];
    try {
      for (const file of Array.from(list).slice(0, room)) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          throw new Error('нужны фото jpg, png или webp');
        }
        const data_url = await compress_image(file);
        next.push({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'работа', data_url });
      }
      set_apply((a) => ({ ...a, role: 'creator', works: [...a.works, ...next].slice(0, max_works) }));
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'фото не прочиталось');
    } finally {
      set_reading(false);
      if (file_ref.current) file_ref.current.value = '';
    }
  }

  async function go_next() {
    if (done) {
      router.push('/study/learn');
      return;
    }
    const err = validate();
    if (err) {
      set_error(err);
      return;
    }
    const next: Apply = {
      ...apply,
      role: 'creator',
      name: apply.name.trim(),
      phone: apply.phone.trim(),
      city: apply.city.trim(),
    };
    set_apply(next);
    save_apply(next);
    if (i === 3) {
      set_sending(true);
      try {
        const res = await fetch('/api/study/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || 'заявка не ушла — попробуй ещё раз');
      } catch (e) {
        set_error(e instanceof Error ? e.message : 'заявка не ушла — попробуй ещё раз');
        set_sending(false);
        return;
      }
      set_sending(false);
    }
    set_i(i + 1);
  }

  if (!ready) return <div className="shell" />;

  return (
    <div className="shell">
      <Topbar title="контент" />
      <div className="progress">
        <span style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
        <div className="w-full max-w-2xl">
          {done ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">готово</p>
              <h1 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">спасибо</h1>
              <p className="mx-auto mt-6 max-w-xl text-lg font-medium leading-relaxed sm:text-xl">
                заявку увидели. мы позвоним. дальше можно пройти короткое обучение.
              </p>
              <p className="mt-8 text-base font-medium text-neutral-500">если удобнее — позвони сам</p>
              <a href={`tel:${intern_phone_tel}`} className="font-heading-soft mt-2 inline-block text-2xl sm:text-3xl">
                {intern_phone}
              </a>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">контент</p>
              <h1 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">
                {i === 0 ? 'привет, как тебя зовут?' : null}
                {i === 1 ? 'номер телефона' : null}
                {i === 2 ? 'в каком городе ты сейчас?' : null}
                {i === 3 ? 'покажи лучшие работы' : null}
              </h1>
              {i === 3 ? (
                <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-neutral-500 sm:text-lg">
                  до 5 фото. по ним видно, как ты снимаешь. за контент — стабильно до 5 напитков в неделю.
                </p>
              ) : null}
              {i < 3 ? (
                <div className="mx-auto mt-10 w-full max-w-sm">
                  <input
                    className="field"
                    type={i === 1 ? 'tel' : 'text'}
                    placeholder={i === 0 ? 'имя' : i === 1 ? 'телефон' : 'город'}
                    value={i === 0 ? apply.name : i === 1 ? apply.phone : apply.city}
                    autoComplete={i === 0 ? 'given-name' : i === 1 ? 'tel' : 'off'}
                    onChange={(e) =>
                      set_apply((a) =>
                        i === 0 ? { ...a, name: e.target.value } : i === 1 ? { ...a, phone: e.target.value } : { ...a, city: e.target.value },
                      )
                    }
                  />
                </div>
              ) : null}

              {i === 3 ? (
                <div className="mx-auto mt-8 w-full max-w-md">
                  <input
                    ref={file_ref}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => void add_files(e.target.files)}
                  />
                  <button
                    type="button"
                    className="option"
                    disabled={reading || apply.works.length >= max_works}
                    onClick={() => file_ref.current?.click()}
                  >
                    {reading ? 'читаем фото' : 'прикрепить фото'}
                  </button>
                  {apply.works.length > 0 ? (
                    <ul className="mt-4 grid grid-cols-3 gap-2">
                      {apply.works.map((work, index) => (
                        <li key={`${work.name}-${index}`} className="relative">
                          <img src={work.data_url} alt={work.name} className="aspect-square w-full rounded-2xl object-cover" />
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-xs"
                            onClick={() =>
                              set_apply((a) => ({ ...a, works: a.works.filter((_, n) => n !== index) }))
                            }
                          >
                            убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-6 min-h-6 text-sm font-medium text-accent">{error}</p>
            </>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-4 px-6 pb-8">
        <button type="button" className="btn btn-ghost" onClick={() => i > 0 && set_i(i - 1)} disabled={i === 0 || sending}>
          назад
        </button>
        <button type="button" className="btn btn-primary min-w-40" onClick={() => void go_next()} disabled={!can_next || sending || reading}>
          {sending ? 'отправляем' : done ? 'к обучению' : 'дальше'}
        </button>
      </footer>
    </div>
  );
}
