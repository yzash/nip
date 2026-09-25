import { db } from '@/data/db'
import type { ActionOption, Incident } from '@/data/types'
import { CLASS_LABEL, date, idr, num } from '@/lib/format'

// Narrative Agent (PRD §7 design rule): the card a COO reads and the checklist a field
// engineer reads come from the same incident.
export function execNarrative(inc: Incident, rec: ActionOption | undefined): string {
  const D = db()
  const where = D.distById[inc.district_id]?.name ?? ''
  const when = inc.predicted_week > 0 ? `by W+${inc.predicted_week} (${date(D.weekEndDates[inc.predicted_week - 1])})` : 'now'
  const cover =
    inc.program_match.verdict === 'covered'
      ? `Already covered by ${inc.program_match.program_id}, RFS ${inc.program_match.eta ? date(inc.program_match.eta) : 'tbc'}.`
      : inc.program_match.verdict === 'partial'
        ? `Partially covered by ${inc.program_match.program_id}: ${inc.program_match.reason?.toLowerCase() ?? 'gaps remain'}.`
        : 'No program covers it yet.'
  const act = rec ? ` Recommended: ${rec.name.charAt(0).toLowerCase() + rec.name.slice(1)} (${rec.cost_idr ? idr(rec.cost_idr) : 'no cost'}, ${rec.lead_days} day${rec.lead_days === 1 ? '' : 's'}).` : ''
  if (inc.class === 'cnx' || inc.class === 'complaints') {
    const seg = inc.segment ? `${inc.segment.charAt(0).toUpperCase() + inc.segment.slice(1)}${inc.technology ? ` ${inc.technology}` : ''} ` : ''
    const drop = inc.cnx_delta !== undefined ? `${seg}CNX is down ${Math.abs(inc.cnx_delta).toFixed(1)} points in 28 days` : 'A complaint cluster is building'
    return `${drop} across ${inc.site_ids.length} sites in ${where}; ${num(inc.churn_risk_subs)} subscribers are in the churn-risk cohort, worth ${idr(inc.exposure_idr)} a month. ${cover}${act}`
  }
  return `${CLASS_LABEL[inc.class]} on ${inc.site_ids.length} site${inc.site_ids.length > 1 ? 's' : ''} in ${where}, ${Math.round(inc.probability * 100)}% likely ${when}, putting ${idr(inc.exposure_idr)} a month at risk across ${num(inc.customers)} subscribers. ${cover}${act}`
}

export function fieldChecklist(inc: Incident): string[] {
  switch (inc.class) {
    case 'capacity':
      return ['Survey mounting space and azimuth for an extra sector', 'Photograph tower loading plate', 'Confirm power budget for two extra RRUs', 'Upload survey form and 360° photos']
    case 'power':
      return ['Measure battery string voltage under load', 'Record 30-minute discharge curve', 'Check rectifier modules and alarms', 'Swap strings from pre-positioned stock if below 60%']
    case 'transport':
      return ['Reconfigure MW path onto the alternate link', 'Verify protection switching with NOC', 'Check ODU alignment and rain fade margin', 'Photograph IDU configuration']
    case 'ran_hardware':
      return ['Confirm VSWR / hardware alarm on arrival', 'Swap faulty unit from regional spares', 'Verify KPI recovery with NOC', 'Photograph replaced part serial']
    case 'environmental':
      return ['Clear drainage and check cabinet plinth height', 'Stage sandbags and portable genset', 'Top up fuel to 100%', 'Photograph site perimeter']
    case 'cnx':
    case 'complaints':
      return ['Walk-test the complaint hotspot at peak hour', 'Check 5G / LTE-A carrier status on each sector', 'Record throughput samples in the app', 'Report findings to CX']
    default:
      return ['Confirm alarm on arrival', 'Replace faulty module', 'Verify KPI recovery with NOC', 'Photograph evidence and close alarm']
  }
}
