export type Student = {
  name: string
}

const key = 'yostudy-student'

export function load_student(): Student | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Student>
    if (!parsed.name) return null
    return { name: parsed.name }
  } catch {
    return null
  }
}

export function save_student(student: Student) {
  localStorage.setItem(key, JSON.stringify(student))
}
