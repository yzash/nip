import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { Toasts } from './Toasts'
import { Guide } from './Guide'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main className="relative min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <Toasts />
      <Guide />
    </div>
  )
}
