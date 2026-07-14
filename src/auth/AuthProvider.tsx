/**
 * Auth state for the whole app. Wraps Supabase Auth and the `profiles` row.
 *
 * The Supabase client is loaded lazily (see lib/supabase). When it is not
 * configured, `configured` is false and the app treats everyone as an anonymous
 * local dev user — the calculator still works over the mock dataset, there is
 * simply no sign-in.
 *
 * Note on passwords: these methods pass the values the USER typed into the app's
 * own forms straight to Supabase. The app never stores or logs them.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
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

async function loadProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await client
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
    let active = true
    let unsub: (() => void) | undefined

    void (async () => {
      const client = await getSupabase()
      if (!client || !active) {
        setLoading(false)
        return
      }
      const { data } = await client.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (data.session) setProfile(await loadProfile(client, data.session.user.id))
      setLoading(false)

      const { data: sub } = client.auth.onAuthStateChange(async (_event, s) => {
        if (!active) return
        setSession(s)
        setProfile(s ? await loadProfile(client, s.user.id) : null)
      })
      unsub = () => sub.subscription.unsubscribe()
    })()

    return () => {
      active = false
      unsub?.()
    }
  }, [])

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    profile,

    async signIn(email, password) {
      const client = await getSupabase()
      if (!client) return { error: 'Sign-in is not configured.' }
      const { error } = await client.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },

    async signUp(args) {
      const client = await getSupabase()
      if (!client) return { error: 'Sign-up is not configured.', needsEmailConfirm: false }
      // Registration details go in user metadata; the DB `handle_new_user`
      // trigger writes them into the profile (and clamps role to clinical roles).
      const { data, error } = await client.auth.signUp({
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
      return { error: null, needsEmailConfirm: !data.session }
    },

    async signOut() {
      const client = await getSupabase()
      await client?.auth.signOut()
      setProfile(null)
    },

    async refreshProfile() {
      const client = await getSupabase()
      if (client && session) setProfile(await loadProfile(client, session.user.id))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
