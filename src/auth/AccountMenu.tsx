/** Compact account status shown in the app header when signed in: who you are,
 *  your registration-verification state, and sign out. */
import { BadgeCheck, Clock, LogOut } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { ROLE_LABEL } from './types'

export function AccountMenu() {
  const { session, profile, signOut } = useAuth()
  if (!session) return null

  const roleLabel = profile && (ROLE_LABEL as Record<string, string>)[profile.role]
  const verified = profile?.registration_verified

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-right leading-tight">
        <div className="font-medium text-slate-800 dark:text-slate-200">
          {profile?.full_name ?? session.user.email}
        </div>
        <div className="flex items-center justify-end gap-1 text-xs">
          {roleLabel && <span className="text-slate-500">{roleLabel}</span>}
          {roleLabel && <span className="text-slate-300">·</span>}
          {verified ? (
            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="h-3 w-3" aria-hidden /> verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" aria-hidden /> pending verification
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => void signOut()}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
      </button>
    </div>
  )
}
