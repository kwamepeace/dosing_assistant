# Supabase schema

The database mirrors [`src/data/schema.ts`](../src/data/schema.ts). Postgres holds
**queryable scalar columns** (ids, weight/age bands, the `verified` flag) plus
**validated JSONB** for the nested shapes that don't decompose cleanly into
relations (the discriminated `Formulation` union, ordered `phases[]`, and the
`Ceiling` union). The application re-parses every JSONB payload with Zod after
fetching, so Postgres is storage and Zod remains the gate.

## Tables

| Table | Mirrors | Notes |
|---|---|---|
| `refs` | `Reference` | Named `refs` because `references` is a SQL reserved word. `licensed` sources are shown but never populated. |
| `drugs` | `Drug` (head) | Formulations and rules are child tables. |
| `formulations` | `Formulation` | Kind-specific fields in the `spec` JSONB. |
| `dosing_rules` | `DosingRule` + `Provenance` | Bands as scalar columns; `phases`/ceilings as JSONB; provenance flattened so `verified` is directly RLS-able. |
| `profiles` | — | Role + professional registration (Pharmacy Council / MDC / N&MC). |
| `calculation_audit` | `CalculationResult` snapshot | Immutable log. **No patient identifiers**, by design. |

## Invariants enforced in the database (mirroring the app loader)

- A rule's provenance must cite the rule's own reference — `CHECK (prov_reference_id = reference_id)`.
- A rule may not be attributed to a `licensed` reference — `forbid_licensed_reference()` trigger.
- A `verified` rule must name its verifier — `CHECK (verified = false OR verified_by IS NOT NULL)`.
- Clinicians (`nurse`/`doctor`/`pharmacist`) can read **only** `verified = true` rules; drafts are visible and writable to `reviewer`/`admin` only (RLS).

## Before production

- ✅ `profiles.role` and `profiles.registration_verified` are locked: the `guard_profile_privilege()` trigger rejects any change to those columns unless the caller is an admin, so the self-service `profiles_self_update` policy cannot be used to self-promote.
- Consider server-side verification of registration numbers against the professional registers (currently `registration_verified` is flipped manually by an admin).

## Applying it

No dosing project exists yet (only unrelated Supabase projects). Once a dedicated
project is created:

```bash
# with the Supabase CLI
supabase link --project-ref <ref>
supabase db push
```

Or apply `migrations/0001_initial_schema.sql` via the SQL editor / MCP
`apply_migration`. Data seeding is deliberately deferred until the Ghana STG
dosing decisions (see the session notes) are settled — only zinc is confirmed
against the STG so far, so there is little verified data to seed yet.

## Client wiring (next step, not yet added)

Add `@supabase/supabase-js`, then a `src/data/remote.ts` that fetches rows and
re-validates them with the existing Zod schemas before handing `DosingRule[]` to
the engine — identical shape to today's local loader, different source.
