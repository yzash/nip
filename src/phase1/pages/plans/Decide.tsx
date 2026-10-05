import { Check, Clock, Pause, Send, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import type { RoleCode } from '@/data/types'
import { Button, ReasonModal } from '@/components/ui'
import { roleDef, useApp } from '@/store/app'
import type { P1Plan } from '../../model'
import { useP1Store } from '../../store'
import { SUBMIT_ROLES, canDecide } from './shared'

export const DEFER_CODES = ['Await next forecast run', 'Bundle with upcoming program', 'Budget envelope exhausted', 'Site survey needed first', 'Tower company constraint', 'Prediction confidence too low']

/** Approve / reject / defer for the named approver; presenter shortcut for everyone else. */
export function DecisionButtons({ p, size = 'md', compact }: { p: P1Plan; size?: 'sm' | 'md'; compact?: boolean }) {
  const role = useApp((s) => s.role)
  const toast = useApp((s) => s.toast)
  const decide = useP1Store((s) => s.decide)
  const [modal, setModal] = useState<'reject' | 'defer' | null>(null)
  if (p.status !== 'pending_approval') return null
  if (!canDecide(role, p)) {
    const r = roleDef(p.route.role as RoleCode)
    if (compact)
      return (
        <Button size="sm" variant="ghost" onClick={() => useApp.getState().setRole(p.route.role as RoleCode)} title={`Awaiting ${p.route.label} · ${r.user}. Presenter shortcut: act as the named approver`}>
          <UserRound size={13} /> Switch to {p.route.role}
        </Button>
      )
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
          <Clock size={13} className="text-warn" /> Awaiting {p.route.label} · <b className="font-semibold text-ink">{r.user}</b>
        </span>
        <Button size="sm" variant="ghost" onClick={() => useApp.getState().setRole(p.route.role as RoleCode)} title="Presenter shortcut: act as the named approver">
          <UserRound size={13} /> Switch to {p.route.role}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        size={size}
        variant="primary"
        onClick={() => {
          decide(p.id, 'approve')
          toast(`${p.id} approved · ready to hand off to ERP, PMO and WMS`)
        }}
      >
        <Check size={14} /> Approve
      </Button>
      <Button size={size} variant="danger" onClick={() => setModal('reject')}>
        <X size={14} /> Reject
      </Button>
      <Button size={size} onClick={() => setModal('defer')}>
        <Pause size={13} /> Defer
      </Button>
      <ReasonModal
        open={modal === 'reject'}
        onClose={() => setModal(null)}
        title={`Reject ${p.id}`}
        confirmLabel="Reject plan"
        onSubmit={(r) => {
          decide(p.id, 'reject', r)
          toast(`${p.id} rejected · ${r}`, 'warn')
        }}
      />
      <ReasonModal
        open={modal === 'defer'}
        onClose={() => setModal(null)}
        title={`Defer ${p.id}`}
        confirmLabel="Defer plan"
        codes={DEFER_CODES}
        onSubmit={(r) => {
          decide(p.id, 'defer', r)
          toast(`${p.id} deferred · ${r}`, 'info')
        }}
      />
    </div>
  )
}

export function SubmitButton({ p }: { p: P1Plan }) {
  const role = useApp((s) => s.role)
  const toast = useApp((s) => s.toast)
  const submit = useP1Store((s) => s.submit)
  if (p.status !== 'draft') return null
  if (!SUBMIT_ROLES.includes(role))
    return (
      <Button variant="ghost" onClick={() => useApp.getState().setRole('PLAN')}>
        <UserRound size={13} /> Switch to PLAN to submit
      </Button>
    )
  return (
    <Button
      variant="primary"
      onClick={() => {
        submit(p.id)
        toast(p.route.auto ? `${p.id} auto-approved · ${p.route.note}` : `${p.id} submitted · routed to ${p.route.label} (${roleDef(p.route.role as RoleCode).user})`)
      }}
    >
      <Send size={13} /> Submit for approval
    </Button>
  )
}
