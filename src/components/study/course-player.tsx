'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/study/topbar'
import { course, type Block, type Card } from '@/lib/study/course'
import { format_intern_when, intern_phone, intern_phone_tel, load_apply } from '@/lib/study/apply'
import { mood_faces, type intern_quiz_block } from '@/lib/study/interns'
import { load_student, type Student } from '@/lib/study/student'

const progress_key = 'yostudy-progress'
const results_key = 'yostudy-results'
const feedback_key = 'yostudy-feedback'
const playable_blocks = course.blocks.filter((b) => !b.locked)

type Progress = { block: number; card: number }

// ключ — `${block}:${card}`, значение — индексы неверных вариантов, выбранных до верного ответа
type QuizPickLog = { option: number; ok: boolean }
type QuizAttemptLog = { picks: QuizPickLog[] }
type ResultLog = { wrongs: number[]; attempts: QuizAttemptLog[]; solved: boolean }
type Results = Record<string, ResultLog | number[]>

function read_log(entry: ResultLog | number[] | undefined): ResultLog {
  if (Array.isArray(entry)) return { wrongs: entry, attempts: [], solved: true }
  if (entry && typeof entry === 'object' && Array.isArray(entry.wrongs)) {
    return {
      wrongs: entry.wrongs,
      attempts: Array.isArray(entry.attempts) ? entry.attempts : [],
      solved: typeof entry.solved === 'boolean' ? entry.solved : true,
    }
  }
  return { wrongs: [], attempts: [], solved: false }
}

function first_try_ok(entry: ResultLog | number[] | undefined) {
  if (entry == null) return false
  const log = read_log(entry)
  return log.solved && log.wrongs.length === 0
}

function first_completion_ok(attempts: QuizAttemptLog[], correct: number[]) {
  if (!attempts.length) return false
  const got = new Set<number>()
  for (const attempt of attempts) {
    for (const pick of attempt.picks) {
      if (!pick.ok) return false
      got.add(pick.option)
    }
    if (correct.every((i) => got.has(i))) return true
  }
  return false
}

function AttemptLines({ attempts, options }: { attempts: QuizAttemptLog[]; options: string[] }) {
  if (!attempts.length) return null
  return (
    <li className="pt-2 text-neutral-500">
      <ol className="space-y-0.5">
        {attempts.map((attempt, ai) => (
          <li key={ai}>
            попытка {ai + 1}:{' '}
            {attempt.picks.map((pick, pi) => {
              const name = options[pick.option] || ''
              if (!name) return null
              return (
                <span key={`${name}-${pi}`}>
                  {pi > 0 ? ', ' : ''}
                  <span className={pick.ok ? 'text-[#2fa36b]' : 'text-accent'}>
                    {name} {pick.ok ? '✓' : '✗'}
                  </span>
                </span>
              )
            })}
          </li>
        ))}
      </ol>
    </li>
  )
}

function build_quiz_report(blocks: Block[], results: Results): intern_quiz_block[] {
  return blocks
    .map((block, block_i) => {
      const items = block.cards
        .map((c, i) => ({ c, i }))
        .filter((x): x is { c: Extract<Card, { type: 'quiz' }>; i: number } => x.c.type === 'quiz')
        .map(({ c, i }) => {
          const entry = results[`${block_i}:${i}`]
          const log = read_log(entry)
          const correct = Array.isArray(c.correct) ? c.correct : [c.correct]
          const attempts = log.attempts.map((attempt) => ({
            picks: attempt.picks
              .map((pick) => ({
                text: c.options[pick.option] || '',
                ok: pick.ok,
              }))
              .filter((pick) => pick.text),
          }))
          return {
            question: c.question,
            ok: log.attempts.length ? first_completion_ok(log.attempts, correct) : first_try_ok(entry),
            tries: Math.max(log.attempts.length, log.wrongs.length ? log.wrongs.length + 1 : entry ? 1 : 0),
            correct: correct.map((oi) => c.options[oi]).filter(Boolean),
            wrong: log.wrongs.map((oi) => c.options[oi]).filter(Boolean),
            attempts,
          }
        })
      if (items.length === 0) return null
      return {
        id: block.id,
        title: block.title,
        clean: items.filter((x) => x.ok).length,
        total: items.length,
        items,
      }
    })
    .filter((x): x is intern_quiz_block => Boolean(x))
}

function load_results(): Results {
  try {
    const raw = localStorage.getItem(results_key)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => Array.isArray(v) || (v && typeof v === 'object'))
    ) as Results
  } catch {
    return {}
  }
}

function load_progress(): Progress | null {
  try {
    const raw = localStorage.getItem(progress_key)
    if (!raw) return null
    const p = JSON.parse(raw) as Progress
    if (typeof p.block !== 'number' || typeof p.card !== 'number') return null
    return p
  } catch {
    return null
  }
}

export default function CoursePlayer() {
  const router = useRouter()
  const blocks = playable_blocks
  const [student, set_student] = useState<Student | null>(null)
  const [block_i, set_block_i] = useState(0)
  const [card_i, set_card_i] = useState(0)
  const [quiz, set_quiz] = useState<QuizState>(empty_quiz)
  const [results, set_results] = useState<Results>({})
  const [done, set_done] = useState(false)
  const [ready, set_ready] = useState(false)
  const [feedback, set_feedback] = useState({ mood: 0, liked: '', disliked: '', sending: false, error: '' })

  const block: Block | undefined = blocks[block_i]
  const card: Card | undefined = block?.cards[card_i]

  useEffect(() => {
    const s = load_student()
    if (!s) {
      router.replace('/study')
      return
    }
    set_student(s)
    set_results(load_results())
    try {
      const raw = localStorage.getItem(feedback_key)
      if (raw) {
        const parsed = JSON.parse(raw) as { mood?: number; liked?: string; disliked?: string }
        const mood = Number(parsed.mood)
        set_feedback((f) => ({
          ...f,
          mood: mood >= 1 && mood <= 5 ? mood : f.mood,
          liked: typeof parsed.liked === 'string' ? parsed.liked : f.liked,
          disliked: typeof parsed.disliked === 'string' ? parsed.disliked : f.disliked,
        }))
      }
    } catch {
      /* ignore */
    }
    const p = load_progress()
    if (p && p.block < blocks.length) {
      set_block_i(p.block)
      set_card_i(Math.min(p.card, blocks[p.block].cards.length - 1))
    }
    set_ready(true)
  }, [blocks, router])

  useEffect(() => {
    if (!ready || done) return
    localStorage.setItem(progress_key, JSON.stringify({ block: block_i, card: card_i }))
  }, [block_i, card_i, ready, done])

  useEffect(() => {
    set_quiz(empty_quiz)
  }, [block_i, card_i])

  const solved = useMemo(() => (card?.type === 'quiz' ? quiz_solved(card, quiz.rights) : true), [card, quiz])
  const checking = card?.type === 'quiz' && !solved
  const can_next =
    card?.type === 'feedback'
      ? feedback.mood >= 1 && !feedback.sending
      : checking
        ? quiz.picks.length > 0
        : true

  function persist_quizzes(next_results: Results) {
    const apply = load_apply()
    const phone = apply?.phone || ''
    if (!phone) return
    void fetch('/api/study/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: apply?.name || student?.name || '',
        phone,
        quizzes: build_quiz_report(blocks, next_results),
      }),
    })
  }

  function check_quiz() {
    if (card?.type !== 'quiz') return
    const correct = correct_set(card)
    const next: QuizState = {
      picks: [],
      rights: [...quiz.rights, ...quiz.picks.filter((i) => correct.includes(i))],
      wrongs: [...quiz.wrongs, ...quiz.picks.filter((i) => !correct.includes(i))],
      tries: quiz.tries + 1,
    }
    set_quiz(next)
    const key = `${block_i}:${card_i}`
    const prev = read_log(results[key])
    const log: ResultLog = {
      wrongs: prev.solved ? prev.wrongs : next.wrongs,
      attempts: [
        ...prev.attempts,
        {
          picks: quiz.picks.map((option) => ({
            option,
            ok: correct.includes(option),
          })),
        },
      ],
      solved: prev.solved || quiz_solved(card, next.rights),
    }
    const r = { ...results, [key]: log }
    set_results(r)
    localStorage.setItem(results_key, JSON.stringify(r))
    persist_quizzes(r)
  }

  async function persist_feedback() {
    const apply = load_apply()
    const payload = {
      mood: feedback.mood,
      liked: feedback.liked.trim(),
      disliked: feedback.disliked.trim(),
      name: apply?.name || student?.name || '',
      phone: apply?.phone || '',
      at: new Date().toISOString(),
      quizzes: build_quiz_report(blocks, results),
    }
    localStorage.setItem(feedback_key, JSON.stringify(payload))
    const res = await fetch('/api/study/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error || 'отзыв не ушёл — попробуй ещё раз')
    }
  }

  async function go_next() {
    if (!block || !can_next) return
    if (checking) return check_quiz()
    if (card?.type === 'feedback') {
      set_feedback((f) => ({ ...f, sending: true, error: '' }))
      try {
        await persist_feedback()
      } catch (e) {
        set_feedback((f) => ({
          ...f,
          sending: false,
          error: e instanceof Error ? e.message : 'не отправилось',
        }))
        return
      }
      set_feedback((f) => ({ ...f, sending: false }))
    }
    if (card_i < block.cards.length - 1) return set_card_i(card_i + 1)
    if (block_i < blocks.length - 1) {
      set_block_i(block_i + 1)
      set_card_i(0)
      return
    }
    set_done(true)
    localStorage.removeItem(progress_key)
    const apply = load_apply()
    void fetch('/api/study/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: apply?.name || student?.name || '',
        phone: apply?.phone || '',
        quizzes: build_quiz_report(blocks, results),
      }),
    })
  }

  function go_prev() {
    if (card_i > 0) return set_card_i(card_i - 1)
    if (block_i > 0) {
      set_block_i(block_i - 1)
      set_card_i(blocks[block_i - 1].cards.length - 1)
    }
  }

  function retry_block(to_card: number) {
    const next: Results = { ...results }
    for (const key of Object.keys(next)) {
      if (!key.startsWith(`${block_i}:`)) continue
      const log = read_log(next[key])
      next[key] = { wrongs: [], attempts: log.attempts, solved: false }
    }
    set_results(next)
    localStorage.setItem(results_key, JSON.stringify(next))
    persist_quizzes(next)
    set_card_i(to_card)
  }

  const score = card?.type === 'results' && block ? block_score(block, block_i, results) : null
  const passed = !score || score.clean / Math.max(score.total, 1) >= (card?.type === 'results' ? card.pass ?? 0.7 : 0)

  if (!ready || !student) return <div className="shell" />

  if (done || !block || !card) {
    return (
      <Finish
        name={student.name}
        blocks={blocks}
        results={results}
        on_retry={() => {
          set_done(false)
          set_results({})
          localStorage.removeItem(results_key)
          set_block_i(0)
          set_card_i(0)
        }}
      />
    )
  }

  const total = block.cards.length
  const is_last_card = card_i === total - 1
  const is_last_block = block_i === blocks.length - 1

  return (
    <div className="shell">
      <Topbar title={`${block.index} · ${block.title}`} />
      <div className="progress">
        <span style={{ width: `${((card_i + 1) / total) * 100}%` }} />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div className="w-full max-w-2xl">
          {card.type === 'story' ? <Story card={card} /> : null}
          {card.type === 'image' ? <Picture card={card} /> : null}
          {card.type === 'key' ? <Key card={card} /> : null}
          {card.type === 'results' ? (
            <ResultsView
              card={card}
              name={student.name}
              block={block}
              block_i={block_i}
              results={results}
              passed={passed}
            />
          ) : null}
          {card.type === 'quiz' ? (
            <Quiz
              card={card}
              state={quiz}
              on_toggle={(i) =>
                set_quiz((q) => ({
                  ...q,
                  picks: q.picks.includes(i) ? q.picks.filter((p) => p !== i) : [...q.picks, i],
                }))
              }
            />
          ) : null}
          {card.type === 'feedback' ? (
            <FeedbackForm
              card={card}
              mood={feedback.mood}
              liked={feedback.liked}
              disliked={feedback.disliked}
              error={feedback.error}
              on_mood={(mood) => set_feedback((f) => ({ ...f, mood }))}
              on_liked={(liked) => set_feedback((f) => ({ ...f, liked }))}
              on_disliked={(disliked) => set_feedback((f) => ({ ...f, disliked }))}
            />
          ) : null}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-4 px-6 pb-8">
        {card.type === 'results' && !passed ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => retry_block(0)}>
              повторить материал
            </button>
            <button
              type="button"
              className="btn btn-primary min-w-40"
              onClick={() => retry_block(block.cards.findIndex((c) => c.type === 'quiz'))}
            >
              пройти тест заново
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={go_prev}
              disabled={block_i === 0 && card_i === 0}
            >
              назад
            </button>
            <button type="button" className="btn btn-primary min-w-40" onClick={go_next} disabled={!can_next}>
              {checking
                ? 'проверить'
                : card.type === 'feedback'
                  ? feedback.sending
                    ? 'отправляем'
                    : 'отправить'
                  : is_last_card
                    ? is_last_block
                      ? 'завершить'
                      : 'следующий раздел'
                    : 'дальше'}
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

function Story({ card }: { card: Extract<Card, { type: 'story' }> }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">{card.kicker}</p>
      <h2 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">{card.title}</h2>
      <div className="scroll-fade mt-2 max-h-[50vh]">
        <div className="space-y-4 py-6 text-base font-medium leading-relaxed text-neutral-700 sm:text-lg">
          {card.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
      {card.key ? (
        <p className="mx-auto mt-8 max-w-md border-t border-neutral-200 pt-5 text-base leading-snug sm:text-lg">
          {card.key}
        </p>
      ) : null}
    </>
  )
}

function Picture({ card }: { card: Extract<Card, { type: 'image' }> }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.src}
        alt=""
        className={
          card.portrait
            ? 'mx-auto max-h-[58vh] w-auto rounded-[28px] object-cover'
            : 'mx-auto aspect-[3/2] w-full max-w-3xl rounded-[28px] object-cover'
        }
      />
      {card.caption ? (
        <p className="mx-auto mt-6 max-w-xl text-base font-medium leading-relaxed text-neutral-600 sm:text-lg">
          {card.caption}
        </p>
      ) : null}
      {card.credit ? <p className="mt-2 text-xs font-medium text-neutral-400">{card.credit}</p> : null}
    </>
  )
}

function Key({ card }: { card: Extract<Card, { type: 'key' }> }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">{card.kicker ?? 'запомнить'}</p>
      <p className="font-heading-soft mx-auto mt-6 max-w-xl text-3xl leading-tight sm:text-5xl">{card.text}</p>
      {card.note ? (
        <p className="mt-6 text-base font-medium text-neutral-500 sm:text-lg">{card.note}</p>
      ) : null}
    </>
  )
}

function block_quizzes(block: Block) {
  return block.cards.map((c, i) => ({ c, i })).filter((x): x is { c: QuizCard; i: number } => x.c.type === 'quiz')
}

function block_score(block: Block, block_i: number, results: Results) {
  const quizzes = block_quizzes(block)
  const clean = quizzes.filter(({ i }) => first_try_ok(results[`${block_i}:${i}`])).length
  return { clean, total: quizzes.length }
}

function ResultsView({
  card,
  name,
  block,
  block_i,
  results,
  passed,
}: {
  card: Extract<Card, { type: 'results' }>
  name: string
  block: Block
  block_i: number
  results: Results
  passed: boolean
}) {
  const quizzes = block_quizzes(block)
  const { clean, total } = block_score(block, block_i, results)
  const [open, set_open] = useState<number | null>(null)
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">итоги</p>
      <h2 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">
        {name}, {passed ? card.title : 'пока рано'}
      </h2>
      <p className="mt-4 text-base font-medium text-neutral-500 sm:text-lg">
        {clean} из {total} — с первой попытки
      </p>
      {!passed ? (
        <p className="mx-auto mt-2 max-w-md text-sm font-medium text-neutral-500">
          чтобы идти дальше, нужно минимум {Math.ceil(total * (card.pass ?? 0.7))} из {total}
        </p>
      ) : null}
      <div className="scroll-fade mx-auto mt-2 max-h-[40vh] max-w-md">
        <ul className="py-5 text-left text-sm font-medium leading-snug">
          {quizzes.map(({ c, i }) => {
            const log = read_log(results[`${block_i}:${i}`])
            const ok = first_try_ok(results[`${block_i}:${i}`])
            const correct = correct_set(c)
            const is_open = open === i
            return (
              <li key={i} className="border-b border-neutral-200 last:border-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 py-2.5 text-left"
                  onClick={() => set_open(is_open ? null : i)}
                >
                  <span className={'mt-0.5 shrink-0 font-bold ' + (ok ? 'text-[#2fa36b]' : 'text-accent')}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-neutral-700">{c.question}</span>
                  <span className="mt-0.5 shrink-0 text-neutral-300">{is_open ? '–' : '+'}</span>
                </button>
                {is_open ? (
                  <ul className="mb-3 ml-6 space-y-1 text-xs sm:text-sm">
                    {c.options.map((o, oi) => {
                      const cls = correct.includes(oi)
                        ? 'text-[#2fa36b]'
                        : log.wrongs.includes(oi)
                          ? 'text-accent line-through'
                          : 'text-neutral-400'
                      return (
                        <li key={o} className={cls}>
                          {o}
                        </li>
                      )
                    })}
                    <AttemptLines attempts={log.attempts} options={c.options} />
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

type QuizCard = Extract<Card, { type: 'quiz' }>

type QuizState = {
  picks: number[] // отмечено, но ещё не проверено
  rights: number[] // проверено, верно
  wrongs: number[] // проверено, неверно
  tries: number
}

const empty_quiz: QuizState = { picks: [], rights: [], wrongs: [], tries: 0 }

function correct_set(card: QuizCard): number[] {
  return Array.isArray(card.correct) ? card.correct : [card.correct]
}

function quiz_solved(card: QuizCard, rights: number[]): boolean {
  return correct_set(card).every((i) => rights.includes(i))
}

function Quiz({ card, state, on_toggle }: { card: QuizCard; state: QuizState; on_toggle: (i: number) => void }) {
  const solved = quiz_solved(card, state.rights)
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">вопрос</p>
      <h2 className="font-heading-soft mt-4 text-2xl leading-tight sm:text-4xl">{card.question}</h2>
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        {card.options.map((option, i) => {
          const is_right = state.rights.includes(i)
          const is_wrong = state.wrongs.includes(i)
          const is_picked = state.picks.includes(i)
          const cls =
            'option' + (is_right ? ' is-right' : '') + (is_wrong ? ' is-wrong' : '') + (is_picked ? ' is-picked' : '')
          return (
            <button
              key={option}
              type="button"
              className={cls}
              disabled={solved || is_wrong || is_right}
              onClick={() => on_toggle(i)}
            >
              {option}
            </button>
          )
        })}
      </div>
      <p className="mt-6 min-h-6 text-sm font-medium text-neutral-500 sm:text-base">
        {solved ? card.explain : state.tries > 0 ? 'не совсем — попробуй ещё раз' : ''}
      </p>
    </>
  )
}

function FeedbackForm({
  card,
  mood,
  liked,
  disliked,
  error,
  on_mood,
  on_liked,
  on_disliked,
}: {
  card: Extract<Card, { type: 'feedback' }>
  mood: number
  liked: string
  disliked: string
  error: string
  on_mood: (mood: number) => void
  on_liked: (value: string) => void
  on_disliked: (value: string) => void
}) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">{card.kicker ?? 'опрос'}</p>
      <h2 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">{card.title}</h2>
      {card.note ? (
        <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-neutral-500 sm:text-lg">
          {card.note}
        </p>
      ) : null}
      <div className="mt-8 flex justify-center gap-2 sm:gap-3">
        {mood_faces.map((face, i) => {
          const value = i + 1
          return (
            <button
              key={face}
              type="button"
              aria-label={`${value} из 5`}
              onClick={() => on_mood(value)}
              className={
                'flex h-14 w-14 items-center justify-center rounded-full text-3xl transition sm:h-16 sm:w-16 ' +
                (mood === value ? 'bg-neutral-900 scale-110' : 'bg-neutral-100')
              }
            >
              {face}
            </button>
          )
        })}
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-4 text-left">
        <label className="block">
          <span className="text-sm font-medium text-neutral-500">что понравилось</span>
          <textarea
            className="mt-2 w-full rounded-[22px] border border-neutral-200 px-4 py-3 text-base font-medium outline-none focus:border-neutral-900"
            rows={3}
            value={liked}
            onChange={(e) => on_liked(e.target.value)}
            placeholder="можно коротко"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-500">что нет</span>
          <textarea
            className="mt-2 w-full rounded-[22px] border border-neutral-200 px-4 py-3 text-base font-medium outline-none focus:border-neutral-900"
            rows={3}
            value={disliked}
            onChange={(e) => on_disliked(e.target.value)}
            placeholder="тоже честно"
          />
        </label>
      </div>
      <p className="mt-4 min-h-6 text-sm font-medium text-accent">{error}</p>
    </>
  )
}

function recap_points(block: Block) {
  return block.cards
    .filter((c): c is Extract<Card, { type: 'key' }> => c.type === 'key' && (c.kicker ?? '').startsWith('коротко'))
    .map((c) => c.text)
}

function PhoneBlock() {
  return (
    <>
      <p className="mt-6 text-base font-medium text-neutral-500">чтобы прийти на стажировку — позвони</p>
      <a href={`tel:${intern_phone_tel}`} className="font-heading-soft mt-2 inline-block text-2xl sm:text-3xl">
        {intern_phone}
      </a>
    </>
  )
}

function Finish({
  name,
  blocks,
  results,
  on_retry,
}: {
  name: string
  blocks: Block[]
  results: Results
  on_retry: () => void
}) {
  const [when, set_when] = useState('')
  const [open, set_open] = useState<string | null>(null)

  useEffect(() => {
    const a = load_apply()
    if (a) set_when(format_intern_when(a.intern_date, a.intern_time))
  }, [])

  return (
    <div className="shell">
      <Topbar title="готово" />
      <main className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10 text-center">
        <div className="w-full max-w-xl pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">готово</p>
          <h1 className="font-heading-soft mt-4 text-3xl leading-tight sm:text-5xl">{name}, обучение пройдено</h1>
          {when ? <p className="mt-6 text-lg font-medium leading-relaxed sm:text-xl">ждём тебя {when}.</p> : null}
          <PhoneBlock />

          <p className="mt-12 text-xs font-bold uppercase tracking-[0.25em] text-accent">что изучили</p>
          <div className="mt-6 space-y-8 text-left">
            {blocks.map((block) => {
              const points = recap_points(block)
              if (points.length === 0) return null
              return (
                <div key={block.id}>
                  <p className="font-heading-soft text-xl">{block.title}</p>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-medium leading-snug text-neutral-700 sm:text-base">
                    {points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>

          <p className="mt-12 text-xs font-bold uppercase tracking-[0.25em] text-accent">результаты</p>
          <div className="mt-6 space-y-8 text-left">
            {blocks.map((block, block_i) => {
              const quizzes = block_quizzes(block)
              if (quizzes.length === 0) return null
              const { clean, total } = block_score(block, block_i, results)
              return (
                <div key={block.id}>
                  <p className="font-heading-soft text-xl">{block.title}</p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    {clean} из {total} — с первой попытки
                  </p>
                  <ul className="mt-3 text-sm font-medium leading-snug">
                    {quizzes.map(({ c, i }) => {
                      const id = `${block_i}:${i}`
                      const log = read_log(results[id])
                      const ok = first_try_ok(results[id])
                      const correct = correct_set(c)
                      const is_open = open === id
                      return (
                        <li key={id} className="border-b border-neutral-200 last:border-0">
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 py-2.5 text-left"
                            onClick={() => set_open(is_open ? null : id)}
                          >
                            <span className={'mt-0.5 shrink-0 font-bold ' + (ok ? 'text-[#2fa36b]' : 'text-accent')}>
                              {ok ? '✓' : '✗'}
                            </span>
                            <span className="flex-1 text-neutral-700">{c.question}</span>
                            <span className="mt-0.5 shrink-0 text-neutral-300">{is_open ? '–' : '+'}</span>
                          </button>
                          {is_open ? (
                            <ul className="mb-3 ml-6 space-y-1 text-xs sm:text-sm">
                              {c.options.map((o, oi) => {
                                const cls = correct.includes(oi)
                                  ? 'text-[#2fa36b]'
                                  : log.wrongs.includes(oi)
                                    ? 'text-accent line-through'
                                    : 'text-neutral-400'
                                return (
                                  <li key={o} className={cls}>
                                    {o}
                                  </li>
                                )
                              })}
                              <AttemptLines attempts={log.attempts} options={c.options} />
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>

          {when ? <p className="mt-12 text-base font-medium leading-relaxed">ждём тебя {when}.</p> : null}
          <p className="mt-4 text-base font-medium text-neutral-500">ещё раз — позвони</p>
          <a href={`tel:${intern_phone_tel}`} className="font-heading-soft mt-2 inline-block text-2xl sm:text-3xl">
            {intern_phone}
          </a>

          <button type="button" className="btn btn-ghost mt-10" onClick={on_retry}>
            пройти ещё раз
          </button>
        </div>
      </main>
    </div>
  )
}
