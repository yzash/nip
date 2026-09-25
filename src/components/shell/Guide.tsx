import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Play, Wand2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { buildPlan } from '@/lib/plan'
import { nextProgramId, todayIso, useApp } from '@/store/app'
import type { LayerId } from '@/store/app'

// The 12-minute walkthrough (PRD §11 demo choreography), runnable without a DevX presenter.
interface Step {
  title: string
  say: string
  role: RoleCode
  to: () => string
  layer?: LayerId
  scrub?: number
  auto?: 'approve_and_plan' | 'submit_plan'
  autoLabel?: string
}

function bekasiIncident() {
  return db().meta.story_incidents.bekasi_capacity
}
function bekasiSite() {
  return db().sites.find((s) => s.story === 'bekasi_capacity' && s.name === 'Jababeka')!.site_id
}

const STEPS: Step[] = [
  {
    title: 'National picture',
    say: 'Monday 08:00 WIB. The Head of Network lands on the national map. The KPI strip shows revenue at risk and 8-week predicted failures, scoped to the whole estate.',
    role: 'EXEC',
    to: () => '/map',
    layer: 'health',
    scrub: 0,
  },
  {
    title: 'See the future',
    say: 'Switch to the Predicted Failure layer and drag the scrubber to W+4. Bekasi and South Sulawesi turn red: the platform sees the failure before customers feel it.',
    role: 'EXEC',
    to: () => '/map',
    layer: 'failure',
    scrub: 28,
  },
  {
    title: 'Bekasi cluster',
    say: 'Click the Bekasi cluster. Site 360 shows the PRB trajectory crossing saturation in 23 days, the forward 8-week prediction and the 14 affected sites.',
    role: 'EXEC',
    to: () => `/map?site=${bekasiSite()}&focus=bekasi`,
    layer: 'failure',
    scrub: 28,
  },
  {
    title: 'Open the incident',
    say: 'One incident per root cause. Program Match says Not covered. The action ladder runs from zero-cost optimisation to a new site; the agent recommends sector add at IDR 350m per site, 5 weeks, with refarming as a bridge.',
    role: 'EXEC',
    to: () => `/incidents?incident=${bekasiIncident()}`,
  },
  {
    title: 'Approve and plan',
    say: 'As Head of Planning, approve rung 4. The plan builder generates the BOQ, checks stock (Semarang has 9 of 14 antennas), allocates a vendor and drafts the PO. Stages 4, 5, 6 and 6b run in parallel.',
    role: 'PLAN',
    to: () => `/incidents?incident=${bekasiIncident()}`,
    auto: 'approve_and_plan',
    autoLabel: 'Approve rung 4 and open the plan builder',
  },
  {
    title: 'Deployment picks it up',
    say: 'Switch to Head of Deployment. The Program Console shows the new program with the vendor allocated, the tower company clock running and RFS in 5 weeks instead of 20.',
    role: 'DEPLOY',
    to: () => '/programs',
    auto: 'submit_plan',
    autoLabel: 'Submit the plan and open the program',
  },
  {
    title: 'Field engineer',
    say: 'Switch to the field engineer in Bekasi. This week’s priority list now carries the 14 site surveys, with checklist, parts status and evidence capture.',
    role: 'FIELD',
    to: () => '/field',
  },
  {
    title: 'Did it work?',
    say: 'The Value Ledger shows a comparable Surabaya program that went live about 90 days ago: realised CNX uplift against a matched control group, measured with difference-in-differences.',
    role: 'EXEC',
    to: () => `/value?tab=validation&program=${db().meta.surabaya_comparable_program}`,
  },
  {
    title: 'The agents behind it',
    say: 'Close on Agent Studio: 30 agents plus 4 proposed by DevX, last run and data freshness, override rates, and every override fed back to Netra as labelled data.',
    role: 'EXEC',
    to: () => '/agents',
  },
]

export function Guide() {
  const open = useApp((s) => s.guideOpen)
  const step = useApp((s) => s.guideStep)
  const setGuide = useApp((s) => s.setGuide)
  const nav = useNavigate()
  if (!open) return null
  const s = STEPS[step]

  const go = (i: number) => {
    const st = STEPS[i]
    const app = useApp.getState()
    app.setRole(st.role)
    if (st.layer) app.setLayer(st.layer)
    if (st.scrub !== undefined) app.setScrub(st.scrub)
    setGuide(true, i)
    nav(st.to())
  }

  const auto = () => {
    const app = useApp.getState()
    const incId = bekasiIncident()
    if (s.auto === 'approve_and_plan') {
      app.setRole('PLAN')
      const inc = app.incidents.find((x) => x.incident_id === incId)!
      if (inc.status === 'Pending_approval') app.decideIncident(incId, 'approve', { rank: 4 })
      const plan = buildPlan({
        siteIds: inc.site_ids,
        intervention: 'sector_add',
        sourceIncident: incId,
        programs: app.programs,
        reservations: app.reservations,
        windowDays: inc.days_to_breach ?? 23,
        today: todayIso(),
        nextProgramId: nextProgramId(app.programs),
      })
      app.setPlan(plan)
      nav('/planner?tab=builder')
      app.toast('Approved by Head of Planning. Plan drafted: BOQ, stock check, vendor and PO.')
    }
    if (s.auto === 'submit_plan') {
      const existing = app.programs.find((p) => p.source_incident === incId)
      let pid = existing?.program_id
      if (!pid) {
        let plan = app.plan
        const inc = app.incidents.find((x) => x.incident_id === incId)!
        if (inc.status === 'Pending_approval') app.decideIncident(incId, 'approve', { rank: 4 })
        if (!plan)
          plan = buildPlan({ siteIds: inc.site_ids, intervention: 'sector_add', sourceIncident: incId, programs: app.programs, reservations: app.reservations, windowDays: 23, today: todayIso(), nextProgramId: nextProgramId(app.programs) })
        pid = app.submitPlan(plan)
      }
      app.setRole('DEPLOY')
      nav(`/programs/${pid}`)
    }
  }

  return (
    <div className="no-print fixed bottom-4 right-4 z-[65] w-[400px] border border-ioh-yellow/60 bg-panel">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">12-minute walkthrough · step {step + 1} of {STEPS.length}</div>
        <button onClick={() => setGuide(false)} className="text-muted hover:text-ink" aria-label="Close walkthrough">
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
          <button onClick={auto} className="flex h-7 items-center gap-1.5 border border-ioh-yellow bg-ioh-yellow/10 px-2.5 text-xs font-semibold text-ioh-yellow" title={s.autoLabel}>
            <Wand2 size={12} /> Do it
          </button>
        )}
        <button disabled={step === STEPS.length - 1} onClick={() => go(step + 1)} className="ml-auto flex h-7 items-center gap-1 border border-line2 px-2.5 text-xs font-semibold disabled:opacity-30">
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
