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

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (vitest)
npm run typecheck  # tsc --noEmit
npm run build      # tsc + vite production build
```

## Status

Milestone M1 (narrow, zero-AI MVP). Engine, schema, three seed drugs (paracetamol,
amoxicillin, zinc), and the calculator UI are in place. Next: verified Ghana STG data,
Supabase + professional-registration auth, and the multi-reference comparison view.

## Tech

React 19 · TypeScript · Vite · Tailwind v4 · Zod · Vitest.

## Licence

All rights reserved (pending a decision). Not currently licensed for reuse.
