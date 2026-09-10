'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/study/topbar'
import { course, type Block, type Card } from '@/lib/study/course'
import { load_student, type Student } from '@/lib/study/student'

const progress_key = 'yostudy-progress'
const results_key = 'yostudy-results'
const playable_blocks = course.blocks.filter((b) => !b.locked)

type Progress = { block: number; card: number }

// ключ — `${block}:${card}`, значение — индексы неверных вариантов, выбранных до верного ответа
type Results = Record<string, number[]>

function load_results(): Results {
  try {
    const raw = localStorage.getItem(results_key)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => Array.isArray(v))) as Results
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
  const can_next = checking ? quiz.picks.length > 0 : true

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
    if (quiz_solved(card, next.rights)) {
      const r = { ...results, [`${block_i}:${card_i}`]: next.wrongs }
      set_results(r)
      localStorage.setItem(results_key, JSON.stringify(r))
    }
  }

  function go_next() {
    if (!block || !can_next) return
    if (checking) return check_quiz()
    if (card_i < block.cards.length - 1) return set_card_i(card_i + 1)
    if (block_i < blocks.length - 1) {
      set_block_i(block_i + 1)
      set_card_i(0)
      return
    }
    set_done(true)
    localStorage.removeItem(progress_key)
  }

  function go_prev() {
    if (card_i > 0) return set_card_i(card_i - 1)
    if (block_i > 0) {
      set_block_i(block_i - 1)
      set_card_i(blocks[block_i - 1].cards.length - 1)
    }
  }

  // сброс результатов теста текущего раздела и переход к карточке
  function retry_block(to_card: number) {
    const r = Object.fromEntries(Object.entries(results).filter(([k]) => !k.startsWith(`${block_i}:`)))
    set_results(r)
    localStorage.setItem(results_key, JSON.stringify(r))
    set_card_i(to_card)
  }

  const score = card?.type === 'results' && block ? block_score(block, block_i, results) : null
  const passed = !score || score.clean / Math.max(score.total, 1) >= (card?.type === 'results' ? card.pass ?? 0.7 : 0)

  if (!ready || !student) return <div className="shell" />

  if (done || !block || !card) {
    return (
      <div className="shell">
        <Topbar title="готово" />
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="max-w-xl">
            <h1 className="font-heading-soft text-4xl leading-tight sm:text-5xl">
              {student.name}, разделы пройдены
            </h1>
            <p className="mt-4 text-base font-medium leading-relaxed text-neutral-600 sm:text-lg">
              следующий шаг — позвонить и прийти на стажировку. среда откроется позже.
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-10"
              onClick={() => {
                set_done(false)
                set_results({})
                localStorage.removeItem(results_key)
                set_block_i(0)
                set_card_i(0)
              }}
            >
              пройти ещё раз
            </button>
          </div>
        </main>
      </div>
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
              {checking ? 'проверить' : is_last_card ? (is_last_block ? 'завершить' : 'следующий раздел') : 'дальше'}
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
  const clean = quizzes.filter(({ i }) => results[`${block_i}:${i}`]?.length === 0).length
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
            const wrongs = results[`${block_i}:${i}`] ?? []
            const ok = wrongs.length === 0
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
                        : wrongs.includes(oi)
                          ? 'text-accent line-through'
                          : 'text-neutral-400'
                      return (
                        <li key={o} className={cls}>
                          {o}
                        </li>
                      )
                    })}
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
