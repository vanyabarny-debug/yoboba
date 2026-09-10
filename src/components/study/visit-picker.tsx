'use client'

import { useMemo, useState } from 'react'

const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const months = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]
const months_of = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

export const intern_hours = ['16:00', '17:00', '18:00', '19:00', '20:00']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse_ymd(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (ymd(d) !== value) return null
  return d
}

function start_of_day(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function hour_num(value: string) {
  return Number(value.slice(0, 2))
}

type Props = {
  date: string
  time: string
  on_date: (value: string) => void
  on_time: (value: string) => void
}

export default function VisitPicker({ date, time, on_date, on_time }: Props) {
  const today = useMemo(() => start_of_day(new Date()), [])
  const max = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 90)
    return d
  }, [today])

  const selected = parse_ymd(date)
  const [cursor, set_cursor] = useState(() => selected ?? today)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const lead = (first.getDay() + 6) % 7
    const count = new Date(year, month + 1, 0).getDate()
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[]
  }, [year, month])

  const min_month = today.getFullYear() * 12 + today.getMonth()
  const max_month = max.getFullYear() * 12 + max.getMonth()
  const cur_month = year * 12 + month
  const now = new Date()

  function day_disabled(day: number) {
    const d = new Date(year, month, day)
    if (d < today || d > max) return true
    if (ymd(d) === ymd(today) && now.getHours() >= 20) return true
    return false
  }

  function time_disabled(hour: string) {
    if (!selected) return false
    if (ymd(selected) !== ymd(today)) return false
    return hour_num(hour) <= now.getHours()
  }

  function pick_day(day: number) {
    if (day_disabled(day)) return
    const value = ymd(new Date(year, month, day))
    on_date(value)
    if (time && time_disabled_for(value, time)) on_time('')
  }

  function time_disabled_for(value: string, hour: string) {
    if (value !== ymd(today)) return false
    return hour_num(hour) <= now.getHours()
  }

  const summary = selected && time ? `${selected.getDate()} ${months_of[selected.getMonth()]}, ${time}` : ''

  return (
    <div className="mx-auto mt-8 w-full max-w-sm">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400 disabled:opacity-20"
          onClick={() => set_cursor(new Date(year, month - 1, 1))}
          disabled={cur_month <= min_month}
          aria-label="предыдущий месяц"
        >
          ‹
        </button>
        <p className="font-heading-soft text-lg">
          {months[month]} {year}
        </p>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400 disabled:opacity-20"
          onClick={() => set_cursor(new Date(year, month + 1, 1))}
          disabled={cur_month >= max_month}
          aria-label="следующий месяц"
        >
          ›
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1">
        {weekdays.map((d) => (
          <span key={d} className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />
          const value = ymd(new Date(year, month, day))
          const disabled = day_disabled(day)
          const picked = date === value
          const is_today = value === ymd(today)
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => pick_day(day)}
              className={
                'mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-20 ' +
                (picked ? 'bg-[#20181b] text-white' : is_today ? 'text-accent' : '')
              }
            >
              {day}
            </button>
          )
        })}
      </div>

      <p className="mt-7 text-xs font-bold uppercase tracking-[0.25em] text-accent">время</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {intern_hours.map((hour) => {
          const off = time_disabled(hour)
          return (
            <button
              key={hour}
              type="button"
              disabled={off}
              onClick={() => on_time(hour)}
              className={
                'min-w-[4.5rem] rounded-full border px-3 py-2 text-sm font-bold transition-colors disabled:opacity-20 ' +
                (time === hour ? 'border-[#20181b] bg-[#20181b] text-white' : 'border-black/15 bg-white')
              }
            >
              {hour}
            </button>
          )
        })}
      </div>

      <p className="mt-5 min-h-6 text-base font-medium text-neutral-500">{summary}</p>
    </div>
  )
}
