/**
 * Supabase client — lazily loaded, and only when the env vars are present.
 *
 * The app runs in TWO modes:
 *   - UNCONFIGURED (no env vars): a local, open "dev mode" over the mock dataset,
 *     no auth. `getSupabase()` resolves to null and `@supabase/supabase-js` is
 *     never even downloaded — it is a dynamic import, so it stays out of the
 *     initial bundle (important for low-bandwidth use).
 *   - CONFIGURED: real Supabase Auth + Postgres; professional sign-in required.
 *
 * Only the ANON key belongs here (public, RLS-protected); never a service-role key.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

let clientPromise: Promise<SupabaseClient> | null = null

/** Resolve the shared client (created once), or null if not configured. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url as string, anonKey as string, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    )
  }
  return clientPromise
}
