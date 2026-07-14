/** Sign-in / create-account screen. Shown only when Supabase is configured and
 *  no one is signed in. Sign-up captures the professional registration that
 *  gates clinical use. All fields are typed by the user; nothing is prefilled. */
import { useState, type FormEvent } from 'react'
import { Loader2, ShieldCheck, Stethoscope } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { REGISTRATION_BODIES, ROLE_LABEL, bodyForRole, type ClinicalRole } from './types'

const labelCls = 'block text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mb-1.5'
const fieldCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition ' +
  'focus:border-slate-800 focus:ring-1 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400'

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<ClinicalRole>('pharmacist')
  const [regNumber, setRegNumber] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    if (mode === 'in') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
    } else {
      const { error, needsEmailConfirm } = await signUp({
        email,
        password,
        fullName,
        role,
        registrationBody: bodyForRole(role),
        registrationNumber: regNumber,
      })
      if (error) setError(error)
      else if (needsEmailConfirm) setNotice('Account created. Check your email to confirm, then sign in.')
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300">
            <Stethoscope className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-serif text-xl text-slate-900 dark:text-slate-100">Paediatric Dosing</h1>
          <p className="text-sm text-slate-500">Sign in with your professional registration</p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium dark:bg-slate-800">
          {(['in', 'up'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setNotice(null) }}
              className={`rounded-md py-1.5 transition ${mode === m ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500'}`}
            >
              {m === 'in' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {mode === 'up' && (
            <>
              <div>
                <label htmlFor="fullName" className={labelCls}>Full name</label>
                <input id="fullName" className={fieldCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              </div>
              <div>
                <label htmlFor="role" className={labelCls}>Role</label>
                <select id="role" className={fieldCls} value={role} onChange={(e) => setRole(e.target.value as ClinicalRole)}>
                  {REGISTRATION_BODIES.map((b) => (
                    <option key={b.id} value={b.roles[0]}>{ROLE_LABEL[b.roles[0]]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reg" className={labelCls}>{bodyForRole(role)} number</label>
                <input id="reg" className={fieldCls} value={regNumber} onChange={(e) => setRegNumber(e.target.value)} required placeholder="Registration number" />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className={labelCls}>Email</label>
            <input id="email" type="email" className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <input id="password" type="password" className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}

          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </button>

          {mode === 'up' && (
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Your registration is recorded now and verified by an administrator before clinical-mode access is granted.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
