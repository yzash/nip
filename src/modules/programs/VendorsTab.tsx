import clsx from 'clsx'
import { RadioTower, Truck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Program } from '@/data/types'
import { Badge, Button, Fresh, Id, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { date, num, pct } from '@/lib/format'
import { useApp, useRole } from '@/store/app'
import { reallocationCandidates, towerOverdue, vendorById, vendorRows, type VendorRow } from './lib'
import { HealthBadge, ReallocateModal, SlipCell, StageLabel } from './parts'

// Vendor and partner lane (PRD §6 M5). Vendor names are fictional placeholders pending IOH's
// partner list.
export function VendorsTab() {
  const programs = useApp((s) => s.programs)
  const role = useRole()
  const nav = useNavigate()
  const [realloc, setRealloc] = useState<Program | null>(null)
  const rows = vendorRows(programs)
  const risk = programs.filter((p) => p.vendor_sla_risk)
  const tower = programs.filter(towerOverdue)
  const canAct = role.role_code === 'DEPLOY' || role.role_code === 'EXEC'

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* at-risk programs first: the Head of Deployment's Monday decision */}
      <section className="border border-line bg-panel">
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Truck size={14} className="text-warn" /> Programs at risk on vendor SLA <span className="tnum font-normal text-faint">{risk.length}</span>
          </h3>
          <span className="flex items-center gap-1.5 text-xs text-faint">
            Vendor Allocation Agent · reallocation options ranked by free capacity × SLA <Fresh f="live" />
          </span>
        </header>
        {!risk.length ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-ok">No program is at risk on vendor SLA. Capacity reallocations are logged in each program’s activity.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Program</Th>
                <Th>Stage</Th>
                <Th>Health</Th>
                <Th>Current vendor</Th>
                <Th>Why at risk</Th>
                <Th>Target → forecast RFS</Th>
                <Th>Best alternative</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {risk.map((p) => {
                const v = vendorById(p.vendor_id)
                const best = reallocationCandidates(p, programs)[0]
                return (
                  <tr key={p.program_id}>
                    <Td className="max-w-[260px]">
                      <Id onClick={() => nav(`/programs/${p.program_id}`)}>{p.program_id}</Id>
                      <div className="truncate text-[13px] font-medium">{p.name}</div>
                      <div className="text-xs text-faint">
                        {p.region} · {p.sites_planned - p.sites_rfs} sites to build
                      </div>
                    </Td>
                    <Td>
                      <StageLabel p={p} />
                    </Td>
                    <Td>
                      <HealthBadge h={p.health} />
                    </Td>
                    <Td className="text-xs">
                      <div className="text-ink">{v?.short}</div>
                      <div className="text-faint">{v?.sla_pct}% SLA</div>
                    </Td>
                    <Td className="py-1.5 text-xs text-warn">
                      <div className="max-w-[360px] whitespace-normal leading-4">{p.blockers.find((b) => b.type === 'vendor_sla')?.text ?? 'Vendor running behind contractual RFS'}</div>
                    </Td>
                    <Td>
                      <SlipCell p={p} />
                    </Td>
                    <Td className="text-xs">
                      {best ? (
                        <>
                          <div className="text-ink">
                            {best.vendor.short} · {best.free} free/mo
                          </div>
                          <div className="text-faint">{best.inRegion ? `in region · ${best.vendor.sla_pct}% SLA` : `cross-region · +${best.mobilisationDays} d mobilisation`}</div>
                        </>
                      ) : (
                        <span className="text-faint">none with capacity</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant={canAct ? 'primary' : 'default'}
                        disabled={!canAct}
                        title={canAct ? undefined : 'Vendor allocation is a Deployment decision'}
                        onClick={() => setRealloc(p)}
                      >
                        Reallocate capacity
                      </Button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="border border-line bg-panel">
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <h3 className="text-sm font-semibold">
            Partners <span className="tnum font-normal text-faint">{rows.length}</span>
          </h3>
          <span className="flex items-center gap-1.5 text-xs text-faint">
            fictional names pending IOH’s partner list · capacity in sites per month <Fresh f="D-1" />
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr>
                <Th>Vendor</Th>
                <Th>Regions</Th>
                <Th className="text-right">In-flight programs</Th>
                <Th className="text-right">Sites allocated</Th>
                <Th className="w-[240px]">Capacity used · month</Th>
                <Th className="text-right">SLA compliance</Th>
                <Th className="text-right">RFS acceptance</Th>
                <Th>At risk</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <VendorLine key={r.vendor.vendor_id} r={r} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-2 text-[11px] leading-4 text-faint">
          Capacity used = in-flight sites (PO to integration) spread over a two-month build window; lighter segment = committed from programs in BOQ. RFS acceptance = share of RFS’d sites (validation
          set, last 180 days) whose post-RFS availability did not worsen. SLA compliance = trailing six months.
        </div>
      </section>

      {tower.length > 0 && (
        <section className="border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <RadioTower size={14} className="text-bad" /> Waiting on tower company access <span className="tnum font-normal text-faint">{tower.length}</span>
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-faint">
              Stage 6b clocks past SLA <Fresh f="D-1" />
            </span>
          </header>
          <div className="grid grid-cols-2 divide-x divide-line">
            {tower.map((p) => {
              const tc = p.tower_company_clock!
              return (
                <button key={p.program_id} onClick={() => nav(`/programs/${p.program_id}`)} className="px-4 py-3 text-left hover:bg-panel2">
                  <div className="flex items-center gap-2">
                    <Id>{p.program_id}</Id>
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {tc.tower_company} · {tc.items}
                  </div>
                  <div className="tnum mt-0.5 text-xs">
                    <span className="text-faint">
                      requested {date(tc.requested)} · SLA {tc.sla_days} d · due {date(tc.due)}
                    </span>{' '}
                    <Badge tone="bad">overdue</Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}
      {realloc && <ReallocateModal program={realloc} onClose={() => setRealloc(null)} />}
    </div>
  )
}

function VendorLine({ r }: { r: VendorRow }) {
  const nav = useNavigate()
  const cap = r.vendor.capacity_sites_per_month
  const used = r.load / cap
  const withCommitted = (r.load + r.committedLoad) / cap
  const c = used > 0.9 ? STATUS.bad : used > 0.7 ? STATUS.warn : '#FFD100'
  return (
    <tr>
      <Td>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ioh-yellow">{r.vendor.short}</span>
          <span className="text-[13px] font-medium text-ink">{r.vendor.name}</span>
        </div>
      </Td>
      <Td className="text-xs text-muted">{r.vendor.regions.join(', ')}</Td>
      <Td className="tnum text-right text-xs">
        <div className="flex flex-wrap justify-end gap-1">
          {r.inflight.length ? (
            r.inflight.map((p) => (
              <Id key={p.program_id} onClick={() => nav(`/programs/${p.program_id}`)} className={clsx('text-[11px]', p.vendor_sla_risk && 'text-warn')}>
                {p.program_id.slice(4)}
              </Id>
            ))
          ) : (
            <span className="text-faint">—</span>
          )}
        </div>
      </Td>
      <Td className="tnum text-right text-sm">{num(r.sitesInflight)}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <div className="relative h-2 flex-1 bg-line">
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.min(100, withCommitted * 100)}%`,
                background: `${c}40`,
              }}
            />
            <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, used * 100)}%`, background: c }} />
          </div>
          <span className="tnum w-[92px] text-right text-xs">
            <span className="text-ink">{r.load}</span>
            <span className="text-faint"> / {cap}</span> <span className={used > 0.9 ? 'text-bad' : 'text-muted'}>{pct(used * 100)}</span>
          </span>
        </div>
        {r.committedLoad > 0 && (
          <div className="tnum mt-0.5 text-[10.5px] text-faint">
            +{r.committedLoad} committed from BOQ-stage programs → {pct(withCommitted * 100)}
          </div>
        )}
      </Td>
      <Td className={clsx('tnum text-right text-sm', r.vendor.sla_pct < 85 ? 'text-bad' : r.vendor.sla_pct < 90 ? 'text-warn' : 'text-ok')}>{r.vendor.sla_pct.toFixed(1)}%</Td>
      <Td className="tnum text-right text-sm">
        {r.rfsAcceptance === null ? (
          <span className="text-xs text-faint">no RFS in 180 d</span>
        ) : (
          <span>
            {r.rfsAcceptance.toFixed(1)}% <span className="text-[10.5px] text-faint">n={r.rfsSites}</span>
          </span>
        )}
      </Td>
      <Td>
        {r.atRisk.length ? (
          <div className="flex gap-1">
            {r.atRisk.map((p) => (
              <Badge key={p.program_id} tone="warn">
                {p.program_id}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </Td>
    </tr>
  )
}
