/**
 * Auth state for the whole app. Wraps Supabase Auth and the `profiles` row.
 *
 * When Supabase is not configured, `configured` is false and the app treats
 * everyone as an anonymous local dev user — the calculator still works over the
 * mock dataset, there is simply no sign-in.
 *
 * Note on passwords: these methods pass the values the USER typed into the app's
 * own forms straight to Supabase. The app never stores or logs them.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { ClinicalRole, Profile } from './types'

interface SignUpArgs {
  email: string
  password: string
  fullName: string
  role: ClinicalRole
  registrationBody: string
  registrationNumber: string
}

interface AuthContextValue {
  configured: boolean
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (args: SignUpArgs) => Promise<{ error: string | null; needsEmailConfirm: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, registration_number, registration_body, registration_verified')
    .eq('id', userId)
    .maybeSingle()
  return (data as Profile) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) setProfile(await loadProfile(data.session.user.id))
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return
      setSession(s)
      setProfile(s ? await loadProfile(s.user.id) : null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    profile,

    async signIn(email, password) {
      if (!supabase) return { error: 'Sign-in is not configured.' }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },

    async signUp(args) {
      if (!supabase) return { error: 'Sign-up is not configured.', needsEmailConfirm: false }
      // Registration details go in user metadata; the DB `handle_new_user`
      // trigger writes them into the profile (and clamps role to clinical roles).
      const { data, error } = await supabase.auth.signUp({
        email: args.email,
        password: args.password,
        options: {
          data: {
            full_name: args.fullName,
            role: args.role,
            registration_body: args.registrationBody,
            registration_number: args.registrationNumber,
          },
        },
      })
      if (error) return { error: error.message, needsEmailConfirm: false }
      // No active session yet => email confirmation is required.
      return { error: null, needsEmailConfirm: !data.session }
    },

    async signOut() {
      await supabase?.auth.signOut()
      setProfile(null)
    },

    async refreshProfile() {
      if (session) setProfile(await loadProfile(session.user.id))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
