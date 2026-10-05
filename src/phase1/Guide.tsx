import clsx from 'clsx'
import { BookOpen, ChevronLeft, ChevronRight, Play, Wand2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { buildPlan } from '@/lib/plan'
import { todayIso, useApp } from '@/store/app'
import { clusterId } from './model'
import { useP1Store } from './store'

// Phase 1 walkthrough: the Bekasi cluster from prediction to ERP hand-off, then how it works.
interface Step {
  title: string
  say: string
  role: RoleCode
  to: () => string
  auto?: 'build' | 'submit' | 'approve' | 'handoff'
  autoLabel?: string
}

const bekasi = () => db().incidents.find((x) => x.story === 'bekasi_capacity')!
const bekasiPlan = () => useP1Store.getState().plans.find((p) => p.cluster_id === clusterId(bekasi().incident_id))
const jababeka = () => db().sites.find((s) => s.story === 'bekasi_capacity' && s.name === 'Jababeka')!.site_id

const STEPS: Step[] = [
  { title: 'Phase 1 in one screen', say: 'Monday 08:00 WIB. The Planner predicts failures 8 weeks ahead across five classes, classifies CapEx or non-CapEx, and hands an approved plan with BOQ and PO drafts to ERP. Capacity and power drive approvals at go-live; transport and RAN are advisory; environmental runs in shadow.', role: 'PLAN', to: () => '/phase1' },
  { title: 'The forecast', say: '119 sites will fail or saturate inside 8 weeks, grouped into clusters by root cause and ranked by money at risk. Bekasi: 14 sites saturate at W+3, IDR 1.8bn a month at risk, and no program covers them.', role: 'PLAN', to: () => `/phase1/forecast?class=capacity&cluster=${clusterId(bekasi().incident_id)}` },
  { title: 'Why the model says so', say: 'Every prediction is explained: base rate plus each feature’s contribution adds up to the probability. For Jababeka the PRB trend and traffic growth drive it, and the site has been flagged red for several weekly runs, so it is not a one-day blip.', role: 'PLAN', to: () => `/phase1/site/${jababeka()}` },
  { title: 'CapEx or non-CapEx', say: 'Smart CapEx (consumed as-is, D-5 data) and the Action Ladder agree: sector add, with zero-cost refarming as a bridge because saturation lands before the hardware. A planner can override with a reason, which becomes training data.', role: 'PLAN', to: () => '/phase1/classify?class=capacity' },
  { title: 'Build the plan', say: 'One click drafts the plan: BOQ from the price book, stock check across eight warehouses (Semarang has 9 of the 14 antennas, 5 go on PO), vendor proposal, PO draft and a critical path where BOQ, PO, vendor and tower company run in parallel. RFS in about 5 weeks instead of 20.', role: 'PLAN', to: () => (bekasiPlan() ? `/phase1/plans/${bekasiPlan()!.id}` : '/phase1/plans'), auto: 'build', autoLabel: 'Draft the Bekasi plan' },
  { title: 'Named approver', say: 'Submitted, the Approval Routing Agent names the approver from IOH’s delegation of authority: minor CapEx above IDR 200m goes to the Head of Planning. Approve, reject or defer, always with a reason.', role: 'PLAN', to: () => (bekasiPlan() ? `/phase1/plans/${bekasiPlan()!.id}` : '/phase1/approvals'), auto: 'approve', autoLabel: 'Submit and approve as Head of Planning' },
  { title: 'Hand-off without re-keying', say: 'Procurement sends the PO draft to ERP, the reservation to the warehouse system, and Deployment sends the BOQ, vendor proposal and tower company request. Each comes back with a reference. Execution stays in IOH’s existing tools.', role: 'PROC', to: () => '/phase1/handoff', auto: 'handoff', autoLabel: 'Send all hand-offs' },
  { title: 'The agents behind it', say: '21 agents across Sense, Predict, Decide, Plan and Govern. One agent, one job, one owner; agents that touch money only draft. Each has a data contract, schedule, SLA and API.', role: 'PLAN', to: () => '/phase1/agents' },
  { title: 'The data IOH must supply', say: '22 sources. Five are already on Netra; the blocking gaps (power telemetry, transport NMS, weather, site master quality, ticket labels, ERP and WMS) are the critical path of the go-live plan.', role: 'PLAN', to: () => '/phase1/data' },
  { title: '16 weeks to go-live', say: 'Six workstreams, a back-test at week 6, live read-only data at week 9, ERP hand-off tested at week 14, go-live at week 16, with exit criteria IOH can hold us to.', role: 'PLAN', to: () => '/phase1/golive' },
]

export function P1GuideButton() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const nav = useNavigate()
  const s = STEPS[step]
  const go = (i: number) => {
    useApp.getState().setRole(STEPS[i].role)
    setStep(i)
    nav(STEPS[i].to())
  }
  const ensurePlan = () => {
    const st = useP1Store.getState()
    let p = bekasiPlan()
    if (!p) {
      const inc = bekasi()
      const app = useApp.getState()
      const draft = buildPlan({ siteIds: inc.site_ids, intervention: 'sector_add', sourceIncident: inc.incident_id, programs: app.programs, reservations: app.reservations, windowDays: inc.days_to_breach ?? 23, today: todayIso(), nextProgramId: 'PL-new' })
      draft.name = 'Bekasi · Capacity Relief — Sector Add'
      st.createPlan(draft, clusterId(inc.incident_id))
      p = bekasiPlan()
    }
    return p!
  }
  const auto = () => {
    const st = useP1Store.getState()
    if (s.auto === 'build') {
      const p = ensurePlan()
      nav(`/phase1/plans/${p.id}`)
      useApp.getState().toast('Plan drafted: BOQ, stock check, vendor proposal, PO draft, critical path')
    }
    if (s.auto === 'approve') {
      const p = ensurePlan()
      useApp.getState().setRole(p.route.role)
      if (p.status === 'draft') st.submit(p.id)
      if (useP1Store.getState().plans.find((x) => x.id === p.id)?.status === 'pending_approval') st.decide(p.id, 'approve')
      nav(`/phase1/plans/${p.id}`)
      useApp.getState().toast(`Approved by ${p.route.label}`)
    }
    if (s.auto === 'handoff') {
      const p = ensurePlan()
      if (p.status === 'draft') st.submit(p.id)
      if (useP1Store.getState().plans.find((x) => x.id === p.id)?.status === 'pending_approval') st.decide(p.id, 'approve')
      for (const t of ['HO-ERP', 'HO-WMS', 'HO-BOQ', 'HO-VENDOR', 'HO-TOWERCO']) st.sendHandoff(p.id, t)
      nav(`/phase1/handoff?plan=${p.id}`)
    }
  }
  return (
    <>
      <button onClick={() => setOpen(!open)} className={clsx('flex h-9 items-center gap-1.5 border px-2.5 text-xs font-semibold', open ? 'border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}>
        <BookOpen size={14} /> Walkthrough
      </button>
      {open && (
        <div className="no-print fixed bottom-4 right-4 z-[65] w-[400px] border border-ioh-yellow/60 bg-panel">
          <div className="flex h-9 items-center justify-between border-b border-line px-3">
            <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Phase 1 walkthrough · step {step + 1} of {STEPS.length}</div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close walkthrough">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-1 px-3 pt-3">
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => go(i)} className={clsx('h-1 flex-1', i <= step ? 'bg-ioh-yellow' : 'bg-line2')} aria-label={`Step ${i + 1}`} />
            ))}
          </div>
          <div className="px-3 py-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[11px] text-faint">{s.role}</span>
              <span className="text-sm font-semibold">{s.title}</span>
            </div>
            <p className="text-[13px] leading-5 text-muted">{s.say}</p>
          </div>
          <div className="flex items-center gap-2 border-t border-line px-3 py-2">
            <button disabled={step === 0} onClick={() => go(step - 1)} className="flex h-7 w-7 items-center justify-center border border-line2 text-muted disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => go(step)} className="flex h-7 items-center gap-1.5 border border-line2 px-2.5 text-xs font-semibold hover:border-muted">
              <Play size={12} /> Set up this step
            </button>
            {s.auto && (
              <button onClick={auto} title={s.autoLabel} className="flex h-7 items-center gap-1.5 border border-ioh-yellow bg-ioh-yellow/10 px-2.5 text-xs font-semibold text-ioh-yellow">
                <Wand2 size={12} /> Do it
              </button>
            )}
            <button disabled={step === STEPS.length - 1} onClick={() => go(step + 1)} className="ml-auto flex h-7 items-center gap-1 border border-line2 px-2.5 text-xs font-semibold disabled:opacity-30">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
