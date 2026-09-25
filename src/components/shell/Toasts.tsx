import clsx from 'clsx'
import { Check, Info, TriangleAlert } from 'lucide-react'
import { useApp } from '@/store/app'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto flex max-w-xl items-center gap-2 border bg-panel px-3 py-2 text-sm',
            t.tone === 'ok' && 'border-ok/50',
            t.tone === 'warn' && 'border-warn/50',
            t.tone === 'info' && 'border-line2',
          )}
        >
          {t.tone === 'ok' ? <Check size={14} className="text-ok" /> : t.tone === 'warn' ? <TriangleAlert size={14} className="text-warn" /> : <Info size={14} className="text-muted" />}
          <span className="text-left">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
