/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent => app runs in open local dev mode. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (publishable) key — safe for client code; RLS enforces access. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
