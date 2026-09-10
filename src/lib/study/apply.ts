import { save_student } from '@/lib/study/student'

export type Apply = {
  name: string
  phone: string
  city: string
  when: string[]
  intern_date: string
  intern_time: string
  urgent: string
  medbook: string
  guest: string
  shift: string
  cook: string
}

const key = 'yostudy-apply'

export const empty_apply: Apply = {
  name: '',
  phone: '',
  city: '',
  when: [],
  intern_date: '',
  intern_time: '',
  urgent: '',
  medbook: '',
  guest: '',
  shift: '',
  cook: '',
}

export function load_apply(): Apply | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Apply>
    if (!parsed.name) return null
    const intern_date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.intern_date ?? '') ? parsed.intern_date ?? '' : ''
    const intern_time = /^\d{2}:\d{2}$/.test(parsed.intern_time ?? '') ? parsed.intern_time ?? '' : ''
    return { ...empty_apply, ...parsed, when: Array.isArray(parsed.when) ? parsed.when : [], intern_date, intern_time }
  } catch {
    return null
  }
}

export function save_apply(apply: Apply) {
  localStorage.setItem(key, JSON.stringify(apply))
  if (apply.name) {
    save_student({ name: apply.name })
  }
}

export const intern_phone = '8(996)270-96-00'
export const intern_phone_tel = '+79962709600'

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

export function format_intern_when(date: string, time: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m || !/^\d{2}:\d{2}$/.test(time)) return ''
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return ''
  return `${Number(m[3])} ${months_of[month]} в ${time}`
}

export type Step =
  | { id: keyof Apply; kind: 'text'; kicker: string; title: string; note?: string; placeholder: string; input: 'text' | 'tel' }
  | { id: keyof Apply; kind: 'single'; kicker: string; title: string; note?: string; options: string[] }
  | { id: 'when'; kind: 'multi'; kicker: string; title: string; note?: string; options: string[] }
  | { id: 'intern'; kind: 'visit'; kicker: string; title: string; note?: string }

export const steps: Step[] = [
  {
    id: 'name',
    kind: 'text',
    kicker: 'заявка',
    title: 'привет, как тебя зовут?',
    placeholder: 'имя',
    input: 'text',
  },
  {
    id: 'phone',
    kind: 'text',
    kicker: 'заявка',
    title: 'номер телефона',
    placeholder: 'телефон',
    input: 'tel',
  },
  {
    id: 'city',
    kind: 'text',
    kicker: 'точка',
    title: 'в каком городе ты сейчас?',
    placeholder: 'город',
    input: 'text',
  },
  {
    id: 'when',
    kind: 'multi',
    kicker: 'смена',
    title: 'какой график тебе подходит?',
    note: 'смены по 10 часов',
    options: ['2/2', '5/2', 'подработка'],
  },
  {
    id: 'urgent',
    kind: 'single',
    kicker: 'работа',
    title: 'насколько срочно нужна работа?',
    options: ['очень срочно', 'в ближайшее время', 'не горит', 'пока присматриваюсь'],
  },
  {
    id: 'medbook',
    kind: 'single',
    kicker: 'допуск',
    title: 'медкнижка есть?',
    options: ['да', 'нет'],
  },
  {
    id: 'guest',
    kind: 'single',
    kicker: 'сцена',
    title: 'стакан собран идеально. гость вернул: «это невозможно пить.»',
    options: [
      'пересоберу, без спора',
      'спрошу спокойно, что именно не так',
      'скажу, что стакан собран как надо',
    ],
  },
  {
    id: 'shift',
    kind: 'single',
    kicker: 'сцена',
    title: 'напарник говорит, что ты не прав. ты так не считаешь. что делаешь?',
    options: [
      'пусть будет по-его, не буду спорить',
      'объясню, почему думаю иначе',
      'останусь при своём',
    ],
  },
  {
    id: 'cook',
    kind: 'single',
    kicker: 'кухня',
    title: 'ты любишь готовить?',
    options: ['да', 'иногда', 'нет'],
  },
  {
    id: 'intern',
    kind: 'visit',
    kicker: 'стажировка',
    title: 'когда придёшь на стажировку?',
    note: 'подходить можно с 16:00 до 20:00',
  },
]
