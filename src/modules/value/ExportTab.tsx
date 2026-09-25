import { Printer } from 'lucide-react'
import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import { Button, Fresh } from '@/components/ui'
import { CLASS_LABEL, date, idr, num, signed } from '@/lib/format'
import { useApp } from '@/store/app'
import { ctrlPostOf, mean, postOf, validationSites } from './calc'
import { ledgerSummary } from './summary'

// Executive one-pager for the monthly network review (PRD §6 M6). Rendered as a paper sheet
// so the on-screen preview matches the printed / saved PDF.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  #root { height: 0 !important; overflow: hidden !important; }
  #root * { overflow: visible !important; }
  main, .print-page { position: static !important; }
  body * { visibility: hidden; }
  .nicc-onepager, .nicc-onepager * { visibility: visible; }
  .nicc-onepager { position: absolute; left: 0; top: 0; width: 900px !important; max-width: none !important; margin: 0 !important; border: 0 !important; padding: 0 !important; zoom: 0.79; }
  .nicc-onepager * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

const INK = '#12141A'
const MUTED = '#5B6270'
const RULE = '#D9DCE1'
const GREEN = '#15803D'
const AMBER = '#B45309'

export function ExportTab() {
  const programs = useApp((s) => s.programs)
  const S = useMemo(() => ledgerSummary(programs), [programs])
  const D = db()
  const pid = D.meta.surabaya_comparable_program
  const sby = programs.find((p) => p.program_id === pid)
  const traj = useMemo(() => {
    const rows = validationSites()
      .filter((s) => s.program_id === pid)
      .map((s) => s.rows.cnx)
      .filter((r) => r.post_90 !== null)
    const steps = [0, 30, 60, 90] as const
    return {
      n: rows.length,
      pts: steps.map((st) => ({
        step: st === 0 ? 'Pre' : `+${st}d`,
        t: mean(rows.map((r) => (st === 0 ? r.pre : postOf(r, st)!))),
        c: mean(rows.map((r) => (st === 0 ? r.control_pre : ctrlPostOf(r, st)!))),
      })),
    }
  }, [pid])
  const sbyDid = traj.pts[3].t - traj.pts[0].t - (traj.pts[3].c - traj.pts[0].c)
  const month = new Date(`${D.meta.as_of}T00:00:00+07:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const execPending = programs.filter((p) => p.pending_approval?.role === 'EXEC')
  const late = programs.filter((p) => p.health === 'late' && !p.complete)
  const topRoi = [...S.roi].sort((a, b) => b.roi - a.roi)
  const lo = Math.min(...traj.pts.flatMap((p) => [p.t, p.c]))
  const hi = Math.max(...traj.pts.flatMap((p) => [p.t, p.c]))

  return (
    <div className="p-5">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[900px] items-center justify-between gap-4">
        <div className="text-sm text-muted">
          Executive one-pager for the monthly network review. Generated from the live ledger; prints to a single A4 page. <Fresh f="D-1" className="ml-1" />
        </div>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={14} /> Print / save PDF
        </Button>
      </div>

      <article className="nicc-onepager mx-auto max-w-[900px] bg-white px-9 py-8" style={{ color: INK, fontSize: 11.5, lineHeight: 1.45 }}>
        {/* Header */}
        <header className="flex items-start justify-between pb-3" style={{ borderBottom: `2px solid ${INK}` }}>
          <div className="flex items-center gap-3">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
              <circle cx="16" cy="16" r="12" fill="none" stroke="#FFD100" strokeWidth="4" />
              <circle cx="16" cy="16" r="4.5" fill="#E4002B" />
            </svg>
            <div>
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 0.4 }} className="font-semibold uppercase">
                Indosat Ooredoo Hutchison · Network Intelligence Command Center
              </div>
              <div className="text-[19px] font-bold leading-6">Monthly network review · {month}</div>
            </div>
          </div>
          <div className="text-right" style={{ fontSize: 10, color: MUTED }}>
            <div>Value Ledger (M6) · data as of {date(D.meta.as_of)} (D-1)</div>
            <div>For: Head of Network, CFO · Prepared {date(D.meta.now)}</div>
            <div className="font-semibold" style={{ color: AMBER }}>
              Synthetic placeholder figures pending IOH calibration
            </div>
          </div>
        </header>

        {/* Headline */}
        <section className="py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div className="text-[14.5px] font-semibold leading-6">
            Proactive interventions are working: treated sites beat matched controls on {S.split.uplift} of {S.roll.sites}, CNX {signed(S.roll.cnxDid)} pts versus control, {idr(S.protectedYtd)} protected
            year to date. Run-rate CapEx ROI {S.roll.roi.toFixed(2)}x against a 1.3x target; decision-to-RFS {S.nicc.toFixed(1)} weeks on NICC-managed programs versus {S.legacy.toFixed(1)} legacy.
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-6" style={{ borderBottom: `1px solid ${RULE}` }}>
          {[
            ['IDR protected YTD', idr(S.protectedYtd), 'revenue DiD + outages avoided'],
            ['Churn avoided', `${num(Math.round(S.roll.churnSubs))}/mo`, `${idr(S.roll.churnIdr)} value`],
            ['CapEx ROI', `${S.roll.roi.toFixed(2)}x`, 'target 1.3x, run-rate'],
            ['Decision → RFS', `${S.nicc.toFixed(1)} wk`, `legacy ${S.legacy.toFixed(1)} wk`],
            ['Precision', `${Math.round(S.capP * 100)}% / ${Math.round(S.powP * 100)}%`, 'capacity / power, top decile'],
            ['Validated 90 d', `${S.at90}/${S.roll.sites}`, 'sites past 90 days'],
          ].map(([l, v, s], i) => (
            <div key={l} className="px-2 py-2.5" style={{ borderLeft: i ? `1px solid ${RULE}` : undefined }}>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: 0.4 }} className="font-semibold uppercase">
                {l}
              </div>
              <div className="tnum text-[16px] font-bold leading-6">{v}</div>
              <div style={{ fontSize: 9.5, color: MUTED }}>{s}</div>
            </div>
          ))}
        </section>

        {/* Proof + ROI */}
        <section className="grid grid-cols-[300px_1fr] gap-5 py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <H>Did it work? {sby?.name ?? pid}</H>
            <div className="text-[13px] font-bold" style={{ color: GREEN }}>
              CNX {signed(sbyDid)} pts vs control at 90 days on {traj.n} sites
            </div>
            <LineChart width={300} height={130} data={traj.pts} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="step" tick={{ fill: MUTED, fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: RULE }} />
              <YAxis domain={[Math.floor(lo - 1), Math.ceil(hi + 1)]} tick={{ fill: MUTED, fontSize: 9.5 }} tickLine={false} axisLine={false} />
              <Line dataKey="c" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: '#9CA3AF', strokeWidth: 0 }} isAnimationActive={false} />
              <Line dataKey="t" stroke="#D4A800" strokeWidth={2.5} dot={{ r: 3, fill: '#D4A800', strokeWidth: 0 }} isAnimationActive={false} />
            </LineChart>
            <div style={{ fontSize: 9.5, color: MUTED }}>
              <span style={{ color: '#B08C00' }} className="font-semibold">
                <svg width="14" height="6" className="mr-1 inline" aria-hidden>
                  <line x1="0" y1="3" x2="14" y2="3" stroke="#D4A800" strokeWidth="2.5" />
                </svg>
                Treated
              </span>{' '}
              ·{' '}
              <span className="font-semibold">
                <svg width="14" height="6" className="mr-1 inline" aria-hidden>
                  <line x1="0" y1="3" x2="14" y2="3" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="3 2" />
                </svg>
                Matched control
              </span> (same province, site class, technology mix, traffic band, pre-period CNX). Difference-in-differences.
            </div>
          </div>
          <div>
            <H>Program ROI · validated programs</H>
            <table className="w-full [&_td+td]:pl-2 [&_th+th]:pl-2" style={{ fontSize: 10.5 }}>
              <thead>
                <tr style={{ color: MUTED, borderBottom: `1px solid ${RULE}` }}>
                  <th className="py-1 text-left font-semibold">Program</th>
                  <th className="text-right font-semibold">Sites</th>
                  <th className="text-right font-semibold">CNX DiD</th>
                  <th className="text-right font-semibold">CapEx</th>
                  <th className="text-right font-semibold">Revenue / yr</th>
                  <th className="text-right font-semibold">Payback</th>
                  <th className="text-right font-semibold">ROI</th>
                </tr>
              </thead>
              <tbody>
                {topRoi.map((r) => (
                  <tr key={r.program.program_id} style={{ borderBottom: `1px solid #EEF0F3` }}>
                    <td className="py-[3px]">
                      <span className="font-mono" style={{ fontSize: 9.5, color: MUTED }}>
                        {r.program.program_id}
                      </span>{' '}
                      {r.program.name.length > 30 ? `${r.program.name.slice(0, 29).trim()}…` : r.program.name}
                    </td>
                    <td className="tnum text-right">{r.sites}</td>
                    <td className="tnum text-right">{signed(r.cnxDid)}</td>
                    <td className="tnum text-right">{idr(r.spent)}</td>
                    <td className="tnum text-right">{idr(r.revAnnual)}</td>
                    <td className="tnum text-right">{r.paybackMonths && r.paybackMonths < 120 ? `${r.paybackMonths.toFixed(0)} mo` : '> 10 y'}</td>
                    <td className="tnum text-right font-bold" style={{ color: r.roi >= 1.3 ? GREEN : r.roi >= 1 ? AMBER : MUTED }}>
                      {r.roi.toFixed(2)}x
                    </td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1">National</td>
                  <td className="tnum text-right">{S.roll.sites}</td>
                  <td className="tnum text-right">{signed(S.roll.cnxDid)}</td>
                  <td className="tnum text-right">{idr(S.roll.spent)}</td>
                  <td className="tnum text-right">{idr(S.roll.revAnnual)}</td>
                  <td className="tnum text-right">{S.roll.paybackMonths ? `${S.roll.paybackMonths.toFixed(0)} mo` : '—'}</td>
                  <td className="tnum text-right" style={{ color: S.roll.roi >= 1.3 ? GREEN : AMBER }}>
                    {S.roll.roi.toFixed(2)}x
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Do more / stop + models */}
        <section className="grid grid-cols-3 gap-5 py-3" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <H>Do more of · best 5 by CNX uplift</H>
            {S.best.slice(0, 5).map((r) => (
              <Row key={r.site_id} a={`${r.site_id} ${r.name}`} b={`${signed(r.v)} pts`} color={GREEN} />
            ))}
          </div>
          <div>
            <H>Stop or rethink · worst 5</H>
            {S.worst.slice(0, 5).map((r) => (
              <Row key={r.site_id} a={`${r.site_id} ${r.name}`} b={`${signed(r.v)} pts`} color="#B91C1C" />
            ))}
          </div>
          <div>
            <H>Model scorecard · top-decile precision</H>
            {D.scorecard.map((s) => (
              <Row key={s.failure_class} a={`${CLASS_LABEL[s.failure_class]} · wave ${s.wave}`} b={`${Math.round(s.precision_top_decile * 100)}%`} color={s.precision_top_decile >= 0.7 ? GREEN : AMBER} />
            ))}
            <div style={{ fontSize: 9.5, color: MUTED }} className="mt-1">
              Drives approvals at ≥ 70% on a 24-month back-test.
            </div>
          </div>
        </section>

        {/* Value pools + decisions */}
        <section className="grid grid-cols-[1fr_290px] gap-5 py-3">
          <div>
            <H>Value pools (PRD §9 formulas, not additive)</H>
            <div className="grid grid-cols-3 gap-x-4">
              {S.pools.map((p) => (
                <Row key={p.pool} a={p.pool} b={p.value === null ? 'method only' : idr(p.value)} color={p.value === null ? MUTED : INK} />
              ))}
            </div>
            <div className="mt-1.5" style={{ fontSize: 9.5, color: MUTED }}>
              Avoided cost: {S.av.n} predicted failures fixed before impact, {idr(S.av.outage)} outage cost avoided for {idr(S.av.cost)} intervention cost.
            </div>
          </div>
          <div className="px-3 py-2" style={{ border: `1px solid ${INK}` }}>
            <H>Decisions for this review</H>
            <ol className="list-decimal space-y-0.5 pl-4" style={{ fontSize: 10.5 }}>
              <li>
                Approve or defer {execPending.length} CapEx program{execPending.length === 1 ? '' : 's'} above threshold{execPending.length ? ` (${execPending.map((p) => p.program_id).join(', ')})` : ''}.
              </li>
              <li>Scale the capacity-relief template of {topRoi[0]?.program.program_id} to the next metro wave.</li>
              <li>Review {S.split.worse} sites below control and {late.length} late programs.</li>
              <li>Confirm Finance accepts matched-control attribution for churn and revenue.</li>
            </ol>
          </div>
        </section>

        <footer className="pt-2" style={{ borderTop: `1px solid ${RULE}`, fontSize: 9, color: MUTED }}>
          Uplift = (Y<sub>treated,post</sub> − Y<sub>treated,pre</sub>) − (Y<sub>control,post</sub> − Y<sub>control,pre</sub>). ROI = (annualised revenue DiD + churn avoided) ÷ CapEx spent. All figures are
          generated from synthetic data to show the metric and the method; IOH baselines, unit costs and targets replace them in the validation session. Source: Netra snapshot, Post-RFS Validation and ROI
          Attribution agents.
        </footer>
      </article>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 font-bold uppercase" style={{ fontSize: 9.5, letterSpacing: 0.5, color: INK }}>
      {children}
    </div>
  )
}

function Row({ a, b, color }: { a: string; b: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px]" style={{ borderBottom: '1px solid #EEF0F3', fontSize: 10.5 }}>
      <span className="truncate">{a}</span>
      <span className="tnum shrink-0 font-semibold" style={{ color }}>
        {b}
      </span>
    </div>
  )
}
