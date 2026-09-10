'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/study/topbar'
import VisitPicker from '@/components/study/visit-picker'
import { empty_apply, intern_phone, intern_phone_tel, load_apply, save_apply, steps, type Apply } from '@/lib/study/apply'

export default function IntakePlayer() {
  const router = useRouter()
  const [apply, set_apply] = useState<Apply>(empty_apply)
  const [i, set_i] = useState(0)
  const [error, set_error] = useState('')
  const [ready, set_ready] = useState(false)
  const [sending, set_sending] = useState(false)

  const done = i >= steps.length
  const step = steps[i]
  const total = steps.length + 1

  useEffect(() => {
    const saved = load_apply()
    if (saved) set_apply(saved)
    set_ready(true)
  }, [])

  useEffect(() => {
    set_error('')
  }, [i])

  const can_next = useMemo(() => {
    if (done) return true
    if (!step) return false
    if (step.kind === 'text') return String(apply[step.id] ?? '').trim().length > 0
    if (step.kind === 'multi') return apply.when.length > 0
    if (step.kind === 'visit') return Boolean(apply.intern_date && apply.intern_time)
    return String(apply[step.id] ?? '').length > 0
  }, [done, step, apply])

  function set_text(id: keyof Apply, value: string) {
    set_apply((a) => ({ ...a, [id]: value }))
  }

  function pick_single(id: keyof Apply, value: string) {
    set_apply((a) => ({ ...a, [id]: value }))
  }

  function toggle_when(value: string) {
    set_apply((a) => ({
      ...a,
      when: a.when.includes(value) ? a.when.filter((x) => x !== value) : [...a.when, value],
    }))
  }

  function validate(): string | null {
    if (!step) return 'шаг не найден'
    if (step.kind === 'text') {
      const v = String(apply[step.id] ?? '').trim()
      if (step.input === 'tel' && v.replace(/\D/g, '').length < 10) return 'проверь телефон'
      if (step.id === 'name' && v.length < 2) return 'напиши имя'
      if (v.length < 2) return 'заполни поле'
    }
    if (step.kind === 'visit' && !can_next) return 'выбери дату и время'
    if (!can_next) return 'выбери вариант'
    return null
  }

  async function submit_apply(payload: Apply) {
    const res = await fetch('/api/study/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error || 'заявка не ушла — попробуй ещё раз')
  }

  async function go_next() {
    if (done) {
      router.push('/study/learn')
      return
    }
    const err = validate()
    if (err) {
      set_error(err)
      return
    }
    const next: Apply = { ...apply }
    if (step?.kind === 'text') {
      const v = String(apply[step.id] ?? '').trim()
      ;(next[step.id] as string) = v
      set_apply(next)
    }
    save_apply(next)
    if (i === steps.length - 1) {
      set_sending(true)
      try {
        await submit_apply(next)
      } catch (e) {
        set_error(e instanceof Error ? e.message : 'заявка не ушла — попробуй ещё раз')
        set_sending(false)
        return
      }
      set_sending(false)
    }
    set_i(i + 1)
  }

  function go_prev() {
    if (i > 0) set_i(i - 1)
  }

  if (!ready || (!done && !step)) return <div className="shell" />

  return (
    <div className="shell">
      <Topbar title="заявка" />
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
                форма заполнена. дальше можно пройти короткое обучение и узнать о нас и о продукте.
              </p>
              <p className="mt-8 text-base font-medium text-neutral-500">чтобы прийти на стажировку — позвони</p>
              <a
                href={`tel:${intern_phone_tel}`}
                className="font-heading-soft mt-2 inline-block text-2xl sm:text-3xl"
              >
                {intern_phone}
              </a>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">{step.kicker}</p>
              <h1 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">{step.title}</h1>
              {step.note ? (
                <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-neutral-500 sm:text-lg">
                  {step.note}
                </p>
              ) : null}

              {step.kind === 'visit' ? (
                <VisitPicker
                  date={apply.intern_date}
                  time={apply.intern_time}
                  on_date={(value) => set_apply((a) => ({ ...a, intern_date: value }))}
                  on_time={(value) => set_apply((a) => ({ ...a, intern_time: value }))}
                />
              ) : null}

              {step.kind === 'text' ? (
                <div className="mx-auto mt-10 w-full max-w-sm">
                  <input
                    className="field"
                    type={step.input}
                    placeholder={step.placeholder}
                    value={String(apply[step.id] ?? '')}
                    onChange={(e) => set_text(step.id, e.target.value)}
                    autoComplete={
                      step.id === 'name' ? 'given-name' : step.id === 'phone' ? 'tel' : 'off'
                    }
                  />
                </div>
              ) : null}

              {step.kind === 'single' ? (
                <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
                  {step.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={'option' + (apply[step.id] === option ? ' is-picked' : '')}
                      onClick={() => pick_single(step.id, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}

              {step.kind === 'multi' ? (
                <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
                  {step.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={'option' + (apply.when.includes(option) ? ' is-picked' : '')}
                      onClick={() => toggle_when(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="mt-6 min-h-6 text-sm font-medium text-accent">{error}</p>
            </>
          )}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-4 px-6 pb-8">
        <button type="button" className="btn btn-ghost" onClick={go_prev} disabled={i === 0}>
          назад
        </button>
        <button type="button" className="btn btn-primary min-w-40" onClick={go_next} disabled={!can_next || sending}>
          {sending ? 'отправляем' : done ? 'к обучению' : 'дальше'}
        </button>
      </footer>
    </div>
  )
}
