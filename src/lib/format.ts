// Formatting conventions (PRD §10): IDR with thousands separators, dates DD MMM YYYY,
// WIB / WITA / WIT by region, tabular figures everywhere.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function num(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** IDR 1.8bn · IDR 350m · IDR 45,000 */
export function idr(v: number, opts: { full?: boolean; digits?: number } = {}): string {
  if (opts.full) return `IDR ${num(Math.round(v))}`
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e12) return `${sign}IDR ${(a / 1e12).toFixed(opts.digits ?? 2)}tn`
  if (a >= 1e9) return `${sign}IDR ${(a / 1e9).toFixed(opts.digits ?? 1)}bn`
  if (a >= 1e6) return `${sign}IDR ${(a / 1e6).toFixed(opts.digits ?? 0)}m`
  if (a === 0) return 'IDR 0'
  return `${sign}IDR ${num(a)}`
}

export function pct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`
}

export function signed(v: number, digits = 1): string {
  const s = v.toFixed(digits)
  return v > 0 ? `+${s}` : v < 0 ? `−${Math.abs(v).toFixed(digits)}` : s
}

function parse(d: string | Date): Date {
  if (d instanceof Date) return d
  return d.length <= 10 ? new Date(`${d}T00:00:00+07:00`) : new Date(d)
}

/** 28 Sep 2026 */
export function date(d: string | Date): string {
  const x = parse(d)
  const wib = new Date(x.getTime() + 7 * 3600e3)
  return `${String(wib.getUTCDate()).padStart(2, '0')} ${MONTHS[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`
}

export function dateShort(d: string | Date): string {
  const x = parse(d)
  const wib = new Date(x.getTime() + 7 * 3600e3)
  return `${String(wib.getUTCDate()).padStart(2, '0')} ${MONTHS[wib.getUTCMonth()]}`
}

export const TZ_OFFSET = { WIB: 7, WITA: 8, WIT: 9 } as const
export type TZ = keyof typeof TZ_OFFSET

/** 08:00 WIB (converted to the zone) */
export function time(d: string | Date, tz: TZ = 'WIB'): string {
  const x = parse(d)
  const z = new Date(x.getTime() + TZ_OFFSET[tz] * 3600e3)
  return `${String(z.getUTCHours()).padStart(2, '0')}:${String(z.getUTCMinutes()).padStart(2, '0')} ${tz}`
}

export function dateTime(d: string | Date, tz: TZ = 'WIB'): string {
  const x = parse(d)
  const z = new Date(x.getTime() + TZ_OFFSET[tz] * 3600e3)
  return `${String(z.getUTCDate()).padStart(2, '0')} ${MONTHS[z.getUTCMonth()]} · ${time(d, tz)}`
}

export function weekday(d: string | Date): string {
  const x = parse(d)
  const wib = new Date(x.getTime() + 7 * 3600e3)
  return DAYS[wib.getUTCDay()]
}

export function addDays(d: string, n: number): string {
  const x = parse(d)
  const y = new Date(x.getTime() + n * 86400e3 + 7 * 3600e3)
  return y.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400e3)
}

/** "in 3 h 20 m" / "4 h overdue" */
export function countdown(due: string, now: string): { text: string; overdue: boolean; hours: number } {
  const h = (parse(due).getTime() - parse(now).getTime()) / 3600e3
  const a = Math.abs(h)
  const txt = a >= 48 ? `${Math.round(a / 24)} d` : a >= 1 ? `${Math.floor(a)} h ${Math.round((a % 1) * 60)} m` : `${Math.round(a * 60)} m`
  return { text: h >= 0 ? txt : `${txt} overdue`, overdue: h < 0, hours: h }
}

export function ago(ts: string, now: string): string {
  const h = (parse(now).getTime() - parse(ts).getTime()) / 3600e3
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} m ago`
  if (h < 48) return `${Math.round(h)} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const CLASS_LABEL: Record<string, string> = {
  capacity: 'Capacity',
  power: 'Power',
  transport: 'Transport',
  ran_hardware: 'RAN hardware',
  environmental: 'Environmental',
  availability: 'Availability',
  bad_session: 'Bad sessions',
  cdn: 'CDN peering',
  energy: 'Energy',
  cnx: 'CNX',
  complaints: 'Complaints',
}

export const STATUS_LABEL: Record<string, string> = {
  Detected: 'Detected',
  Enriched: 'Enriched',
  Pending_approval: 'Pending approval',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Deferred: 'Deferred',
  In_program: 'In program',
  RFS: 'RFS',
  Validating: 'Validating',
  Closed: 'Closed',
}

export const INTERVENTION_LABEL: Record<string, string> = {
  noncapex_zero: 'Non-CapEx · zero cost',
  noncapex_opex: 'Non-CapEx · OpEx',
  capex_minor: 'CapEx · minor',
  capex_major: 'CapEx · major',
  customer_action: 'Customer action',
}

export const SEGMENT_LABEL: Record<string, string> = {
  consumer_4g: 'Consumer 4G',
  consumer_5g: 'Consumer 5G',
  postpaid: 'Postpaid',
  enterprise: 'Enterprise',
}
