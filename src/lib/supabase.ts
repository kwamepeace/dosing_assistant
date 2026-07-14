/**
 * Supabase client — created only when the two env vars are present.
 *
 * The app is designed to run in TWO modes:
 *   - UNCONFIGURED (no env vars): a local, open "dev mode" over the mock dataset,
 *     with no auth. This is the current state (no dosing project provisioned).
 *   - CONFIGURED: real Supabase Auth; professional sign-in is required.
 *
 * Keeping the client nullable means the whole app compiles and runs with no
 * backend, and flips to gated auth the moment `.env` is filled in — no code
 * change. Only the ANON key belongs here (public, RLS-protected); never a
 * service-role key in client code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
