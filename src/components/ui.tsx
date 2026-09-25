import clsx from 'clsx'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { statusColor } from '@/lib/colors'
import { REASON_CODES } from '@/lib/policy'

export function Panel({ className, children, title, right, pad = true }: { className?: string; children: ReactNode; title?: ReactNode; right?: ReactNode; pad?: boolean }) {
  return (
    <section className={clsx('border border-line bg-panel', className)}>
      {title !== undefined && (
        <header className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={clsx(pad && 'p-4')}>{children}</div>
    </section>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'prog' | 'yellow' | 'red' | 'blue'; className?: string }) {
  const tones: Record<string, string> = {
    neutral: 'border-line2 text-muted',
    ok: 'border-ok/40 text-ok bg-ok/10',
    warn: 'border-warn/40 text-warn bg-warn/10',
    bad: 'border-bad/40 text-bad bg-bad/10',
    prog: 'border-prog/50 text-[#B79CFF] bg-prog/10',
    yellow: 'border-ioh-yellow/50 text-ioh-yellow bg-ioh-yellow/10',
    red: 'border-ioh-red/60 text-white bg-ioh-red/80',
    blue: 'border-[#5AA9E6]/40 text-[#8CC4F0] bg-[#5AA9E6]/10',
  }
  return <span className={clsx('inline-flex h-5 items-center gap-1 whitespace-nowrap border px-1.5 text-2xs font-semibold uppercase tracking-wide', tones[tone], className)}>{children}</span>
}

export function Dot({ status, className }: { status: number; className?: string }) {
  return <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: statusColor(status) }} />
}

/** Every number has an age (PRD §11 principle 2). */
export function Fresh({ f, asOf, className }: { f: string; asOf?: string; className?: string }) {
  const tone = f === 'live' ? 'text-ok border-ok/30' : f === 'D-5' ? 'text-warn border-warn/30' : 'text-muted border-line2'
  return (
    <span title={asOf ? `Data as of ${asOf}` : undefined} className={clsx('inline-flex h-4 shrink-0 items-center whitespace-nowrap border px-1 font-mono text-[9.5px] leading-none', tone, className)}>
      {f}
    </span>
  )
}

export function Id({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <span onClick={onClick} className={clsx('font-mono text-[11.5px] text-muted', onClick && 'cursor-pointer hover:text-ioh-yellow', className)}>
      {children}
    </span>
  )
}

export function Kpi({ label, value, sub, fresh, tone, className, onClick }: { label: string; value: ReactNode; sub?: ReactNode; fresh?: string; tone?: 'ok' | 'warn' | 'bad' | 'yellow'; className?: string; onClick?: () => void }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div onClick={onClick} className={clsx('min-w-0 shrink-0 border-line px-4 py-2.5', onClick && 'cursor-pointer hover:bg-panel2', className)}>
      <div className="flex items-center gap-1.5 whitespace-nowrap text-2xs font-medium uppercase tracking-wider text-faint">
        <span className="truncate">{label}</span>
        {fresh && <Fresh f={fresh} />}
      </div>
      <div className={clsx('tnum mt-0.5 truncate text-xl font-semibold leading-7', tc)}>{value}</div>
      {sub && <div className="tnum truncate text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  className,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'ok'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  const v: Record<string, string> = {
    default: 'border-line2 bg-panel2 text-ink hover:border-muted',
    primary: 'border-ioh-yellow bg-ioh-yellow text-canvas hover:bg-[#ffe04d]',
    danger: 'border-bad/60 bg-bad/10 text-bad hover:bg-bad/20',
    ok: 'border-ok/60 bg-ok/10 text-ok hover:bg-ok/20',
    ghost: 'border-transparent text-muted hover:text-ink hover:bg-panel2',
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
        v[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div className={clsx('flex h-10 items-stretch gap-1 border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors',
            value === t.id ? 'border-ioh-yellow text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Spark({ values, width = 90, height = 24, color = '#A3AAB8', markers, domain }: { values: number[]; width?: number; height?: number; color?: string; markers?: number[]; domain?: [number, number] }) {
  if (!values.length) return null
  const lo = domain?.[0] ?? Math.min(...values)
  const hi = domain?.[1] ?? Math.max(...values)
  const r = hi - lo || 1
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * width
  const y = (v: number) => height - 2 - ((v - lo) / r) * (height - 4)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} className="block overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
      {markers?.map((i) => <circle key={i} cx={x(i)} cy={y(values[i])} r={2.2} fill="#FF3B3B" />)}
    </svg>
  )
}

export function Bar({ value, max = 1, color = '#FFD100', className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full bg-line', className)}>
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  )
}

export function Drawer({ open, onClose, children, width = 520, title }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; title?: ReactNode }) {
  if (!open) return null
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex flex-col border-l border-line bg-panel" style={{ width, maxWidth: '100%' }}>
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="min-w-0 truncate text-sm font-semibold">{title}</div>
        <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  )
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] overflow-y-auto border border-line2 bg-panel" style={{ width, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex h-10 items-center justify-between border-b border-line px-4">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

/** Reason capture: every rejection and override carries a reason code (PRD §5, §6 M3). */
export function ReasonModal({ open, onClose, onSubmit, title, confirmLabel = 'Confirm', codes = REASON_CODES }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; title: string; confirmLabel?: string; codes?: string[] }) {
  const [code, setCode] = useState(codes[0])
  const [note, setNote] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <label className="mb-1 block text-xs text-muted">Reason code (required, fed back to Netra as a training signal)</label>
      <select value={code} onChange={(e) => setCode(e.target.value)} className="mb-3 h-8 w-full border border-line2 bg-panel2 px-2 text-sm">
        {codes.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label className="mb-1 block text-xs text-muted">Note (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mb-4 w-full border border-line2 bg-panel2 p-2 text-sm" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onSubmit(note ? `${code} — ${note}` : code)
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-faint">{children}</div>
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('text-2xs font-semibold uppercase tracking-wider text-faint', className)}>{children}</div>
}

export function Th({ children, className, onClick }: { children?: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={clsx('sticky top-0 z-10 h-8 whitespace-nowrap border-b border-line bg-panel px-3 text-left text-2xs font-semibold uppercase tracking-wider text-faint', onClick && 'cursor-pointer hover:text-ink', className)}>
      {children}
    </th>
  )
}
export function Td({ children, className, title }: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={clsx('h-9 whitespace-nowrap border-b border-line/70 px-3 text-sm', className)}>
      {children}
    </td>
  )
}

export function Seg<T extends string | number>({ options, value, onChange, className }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('inline-flex border border-line2', className)}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={clsx('h-7 px-2.5 text-xs font-semibold', value === o.id ? 'bg-ioh-yellow text-canvas' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ steps, current, done }: { steps: string[]; current: number; done?: boolean }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const st = i < current || done ? 'done' : i === current ? 'cur' : 'todo'
        return (
          <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div className={clsx('h-px flex-1', i === 0 ? 'bg-transparent' : st === 'todo' ? 'bg-line2' : 'bg-ioh-yellow')} />
              <div
                className={clsx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                  st === 'done' && 'border-ioh-yellow bg-ioh-yellow text-canvas',
                  st === 'cur' && 'border-ioh-yellow text-ioh-yellow',
                  st === 'todo' && 'border-line2 text-faint',
                )}
              >
                {i + 1}
              </div>
              <div className={clsx('h-px flex-1', i === steps.length - 1 ? 'bg-transparent' : i < current || done ? 'bg-ioh-yellow' : 'bg-line2')} />
            </div>
            <div className={clsx('truncate px-1 text-center text-[10.5px] leading-tight', st === 'todo' ? 'text-faint' : 'text-ink')}>{s}</div>
          </div>
        )
      })}
    </div>
  )
}
