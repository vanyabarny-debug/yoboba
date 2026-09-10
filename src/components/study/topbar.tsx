import Link from 'next/link'
import { STUDY_NAME } from '@/lib/brand'

export default function Topbar({ title }: { title: string }) {
  return (
    <header className="topbar">
      <Link href="/study" className="font-logo text-lg text-accent">
        {STUDY_NAME}
      </Link>
      <span className="text-sm font-medium text-mute">{title}</span>
    </header>
  )
}
