import { db } from '@/data/db'
import type { Agent, AgentRun } from '@/data/types'

export const FAMILIES = ['Sense', 'Predict', 'Decide', 'Execute', 'Validate', 'Orchestrate', 'DevX proposed'] as const

export type ExistsGroup = 'Yes' | 'Partial' | 'To build' | 'No' | 'Proposed'
export const EXISTS_ORDER: ExistsGroup[] = ['Yes', 'Partial', 'To build', 'No', 'Proposed']

export function existsGroup(a: Agent): ExistsGroup {
  const e = a.exists_today.toLowerCase()
  if (e.startsWith('yes')) return 'Yes'
  if (e.startsWith('partial')) return 'Partial'
  if (e.startsWith('to build')) return 'To build'
  if (e.startsWith('proposed')) return 'Proposed'
  return 'No'
}

export const EXISTS_TONE: Record<ExistsGroup, 'ok' | 'warn' | 'yellow' | 'neutral' | 'prog'> = {
  Yes: 'ok',
  Partial: 'warn',
  'To build': 'yellow',
  No: 'neutral',
  Proposed: 'prog',
}

/** Agents that touch money draft, never execute (PRD §7 design rules). */
export const MONEY_AGENTS = new Set(['BOQ Agent', 'Procurement Agent', 'Vendor Allocation Agent'])

export interface AgentStat {
  runs: number
  outputs: number
  accepted: number
  overridden: number
  ignored: number
  lastRun: string | null
  reasons: Record<string, number>
}

let _stats: Map<string, AgentStat> | null = null
export function agentStats(): Map<string, AgentStat> {
  if (_stats) return _stats
  const m = new Map<string, AgentStat>()
  for (const a of db().agents) m.set(a.agent_id, { runs: 0, outputs: 0, accepted: 0, overridden: 0, ignored: 0, lastRun: null, reasons: {} })
  for (const r of db().agentRuns) {
    const s = m.get(r.agent_id)
    if (!s) continue
    s.runs++
    s.outputs += r.outputs
    s.accepted += r.accepted
    s.overridden += r.overridden
    s.ignored += r.ignored
    if (!s.lastRun || r.timestamp > s.lastRun) s.lastRun = r.timestamp
    if (r.override_reason && r.overridden > 0) s.reasons[r.override_reason] = (s.reasons[r.override_reason] ?? 0) + r.overridden
  }
  _stats = m
  return m
}

export function agentById(id: string): Agent | undefined {
  return db().agents.find((a) => a.agent_id === id)
}

export function runsFor(agentId: string): AgentRun[] {
  return db()
    .agentRuns.filter((r) => r.agent_id === agentId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function agentByName(name: string): Agent | undefined {
  const n = name.replace(/\s*\(auto\)\s*$/, '')
  return db().agents.find((a) => a.name === n)
}
