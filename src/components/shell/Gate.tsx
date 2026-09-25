import { useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Marque } from '@/App'

// Lightweight stakeholder-session gate. Set VITE_DEMO_PASSWORD_SHA256 at build time to enable.
// This is a courtesy screen, not security: pair it with host-level protection
// (Vercel / Netlify password protection) for the real session.
const HASH = (import.meta.env.VITE_DEMO_PASSWORD_SHA256 as string | undefined)?.toLowerCase()

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function unlocked(): boolean {
  try {
    return sessionStorage.getItem('nicc-unlocked') === '1'
  } catch {
    return false
  }
}

export function Gate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(!HASH || unlocked())
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)
  if (ok) return <>{children}</>
  return (
    <div className="flex h-full items-center justify-center">
      <form
        className="w-80 border border-line bg-panel p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          if ((await sha256(pw)) === HASH) {
            try {
              sessionStorage.setItem('nicc-unlocked', '1')
            } catch {
              /* private mode */
            }
            setOk(true)
          } else setErr(true)
        }}
      >
        <Marque />
        <div className="mt-5 text-sm font-semibold">Network Intelligence Command Center</div>
        <div className="mb-4 text-xs text-muted">Prototype on synthetic data · stakeholder session</div>
        <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
          <Lock size={12} /> Session password
        </label>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="h-9 w-full border border-line2 bg-panel2 px-2 text-sm" />
        {err && <div className="mt-2 text-xs text-bad">Incorrect password</div>}
        <button type="submit" className="mt-4 h-9 w-full bg-ioh-yellow text-sm font-semibold text-canvas">
          Enter
        </button>
      </form>
    </div>
  )
}
