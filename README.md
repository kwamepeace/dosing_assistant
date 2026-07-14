# Paediatric Dosing & Dispensing Calculator (Ghana)

> ⚠️ **NOT FOR CLINICAL USE.** This is an early development build. All dosing data
> currently shipped is **unverified placeholder data** (`dataStatus: mock_for_ui_testing`,
> every rule `provenance.verified: false`). No number here has been confirmed against a
> primary source by a pharmacist. Do not use it to dose a real patient.

A web tool for nurses, doctors, and pharmacists in Ghanaian facilities: enter a child's
weight (and age where needed), pick the drug, formulation and reference source, and get

- the **administration dose** — how much to give per dose, and how often,
- the **quantity to dispense** — whole bottles / packs for the course,

with every figure traceable to a cited, (eventually) pharmacist-verified source.

## Design principle

The system is built around one invariant: **no dose is trusted until a pharmacist has
confirmed it against its primary source.** The engine is pure and deterministic — no LLM
ever produces a dose number. Unverified rules raise a loud warning and are intended to be
blocked outright in a future "clinical mode".

## Architecture

| Layer | What it does |
|---|---|
| `src/data/schema.ts` | Canonical Zod schema — the single source of truth for drug/rule/formulation shape and safety invariants (half-open bands, ceiling-takes-the-lower, per-rule provenance). |
| `src/data/*` | Seed drug data + references, validated against the schema at load (`src/data/index.ts` fails fast on malformed or licensed-source data). |
| `src/engine/*` | Deterministic calculation: `selectRule` (band/age/indication match) → `calculate` (dose → caps → measurable administration → dispensing). Fully unit-tested. |
| `src/ui/*`, `src/App.tsx` | Thin React UI that renders only what the engine returned. |

## Reference sources

Ghana STG 2017 and WHO material are transcribed into the app's own cited dataset. **BNFc
and Lexicomp are proprietary** — they appear in the picker as "licence required" and are
never populated from copied content. The data loader refuses to serve any rule attributed
to a licensed source.

## Authentication

Sign-in is **professional-registration based** and gated by role. It only turns on
when Supabase is configured:

- **No `.env`** → the app runs in open **local dev mode** over the mock dataset (no auth). This is the default.
- **`.env` filled in** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) → sign-in is required. Creating an account captures the clinician's role (nurse/doctor/pharmacist) and registration number with the matching Ghanaian register (Pharmacy Council / MDC / Nursing & Midwifery Council). Registration is marked **pending** until an administrator verifies it; roles are clamped so no one can self-grant `reviewer`/`admin`.

The `profiles` table, RLS, and the sign-up trigger live in [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql).

## Develop

```bash
npm install
cp .env.example .env   # optional — leave blank for open dev mode
npm run dev        # http://localhost:5173
npm test           # engine unit tests (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # tsc + vite production build
```

## Status

Engine, schema, three seed drugs (paracetamol, amoxicillin, zinc with real Ghana STG
citations), the side-by-side STG-vs-WHO comparison view, the Supabase schema/migration,
and professional-registration auth are in place. Next: a live Supabase project to apply
the migration against, clinician countersign to flip rules to `verified`, offline/PWA,
and the data-authoring + clinical-assistant agent surfaces.

## Tech

React 19 · TypeScript · Vite · Tailwind v4 · Zod · Vitest · Supabase (Auth + Postgres + RLS).

## Licence

All rights reserved (pending a decision). Not currently licensed for reuse.
