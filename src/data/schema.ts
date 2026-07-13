/**
 * CANONICAL DRUG-DATA SCHEMA  (the "M0.5 schema freeze")
 * --------------------------------------------------------
 * One Zod source of truth. JSON/TS drug data is validated against this at load
 * (src/data/index.ts) so malformed — and therefore clinically dangerous — data
 * fails fast instead of producing a wrong number.
 *
 * Design invariants baked in here (all from the multi-agent design review):
 *  - Every clinical number is a Quantity {value, unit}. Units are never bare.
 *    The unit's *dimension* (mass/volume/IU/...) is derived in the engine
 *    (src/engine/units.ts), not duplicated in data — one less thing to get wrong.
 *  - Weight/age bands are half-open [min, max): maxKgExcl is EXCLUSIVE, so a
 *    child of exactly 20 kg lands in exactly one band (no overlap, no gap).
 *  - Ceilings are a union: absolute (mg) OR per-kg (mg/kg). The engine clamps to
 *    the LOWER of the two — this is what makes paracetamol's 75 mg/kg/day cap
 *    actually protect a small child (an absolute 4000 mg cap never would).
 *  - Formulations are a discriminated union. reconstituted_vial carries an
 *    explicit finalConcentration so administration uses the VOLUME (mL) path —
 *    never "round up to a whole vial" (that was a real 2x-overdose bug).
 *  - A rule owns ordered phases[]: a single steady-state phase for most drugs,
 *    multiple (or a `schedule` note) for loading/0-12-24h/taper regimens. When a
 *    schedule is non-uniform the engine refuses to fabricate a flat daily total.
 *  - provenance.verified is per-rule. Anything false forces the "verify against
 *    the primary source" banner and is blocked from a future "clinical mode".
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Units & quantities
// ---------------------------------------------------------------------------
export const Unit = z.enum([
  // mass
  'mcg', 'mg', 'g',
  // volume
  'mL', 'L',
  // dimensions reserved for later (insulin = IU, electrolytes = mmol). The
  // engine recognises them but v1 refuses to *compute* a dose in these units
  // and says so plainly, rather than silently mishandling insulin.
  'IU', 'mmol',
  // discrete count units
  'tablet', 'capsule', 'sachet', 'vial',
])
export type Unit = z.infer<typeof Unit>

export const Quantity = z.object({
  value: z.number(),
  unit: Unit,
})
export type Quantity = z.infer<typeof Quantity>

export const Route = z.enum(['oral', 'iv', 'im', 'rectal', 'subcut', 'sublingual'])
export type Route = z.infer<typeof Route>

// ---------------------------------------------------------------------------
// Ceilings — absolute OR weight-derived. Engine clamps to the lower.
// ---------------------------------------------------------------------------
export const Ceiling = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('absolute'), amount: Quantity }),
  z.object({ kind: z.literal('per_kg'), amountPerKg: Quantity }), // e.g. 75 mg/kg/day
])
export type Ceiling = z.infer<typeof Ceiling>

// ---------------------------------------------------------------------------
// Provenance / verification status (per rule)
// ---------------------------------------------------------------------------
export const Provenance = z.object({
  referenceId: z.string(),
  editionId: z.string(),
  citation: z.string(), // e.g. "Ghana STG 2017, Ch. 2 Malaria, p.xx"
  verified: z.boolean(), // false => mandatory "verify before clinical use" banner
  verifiedBy: z.string().nullish(),
  verificationNote: z.string(), // exactly which document/section to confirm
})
export type Provenance = z.infer<typeof Provenance>

// ---------------------------------------------------------------------------
// Dose specification (one phase of a regimen)
// ---------------------------------------------------------------------------
export const DoseSpec = z.object({
  basis: z.enum(['per_dose', 'per_day']), // mg/kg/DOSE vs mg/kg/DAY — never ambiguous
  perKg: z.boolean(), // true => multiply `amount` by body weight
  amount: Quantity, // 3 mg/kg, or a flat 500 mg
  amountMax: Quantity.nullish(), // optional range upper bound (e.g. 30-50 mg/kg/day)
  frequencyPerDay: z.number().int().positive(), // q8h => 3
  maxDosesPer24h: z.number().int().positive().nullish(), // distinct clinical limit (para: 4)
  route: Route,
})
export type DoseSpec = z.infer<typeof DoseSpec>

const Band = z.object({
  minKgIncl: z.number().nullable(),
  maxKgExcl: z.number().nullable(), // EXCLUSIVE
})
const AgeBand = z.object({
  minMonthsIncl: z.number().nullable(),
  maxMonthsExcl: z.number().nullable(), // EXCLUSIVE
})

export const Phase = z.object({
  label: z.string(), // "maintenance" | "loading" | "0/12/24h then daily"
  dose: DoseSpec,
  durationDays: z.number().positive().nullish(),
  schedule: z.string().nullish(), // free-text note for non-uniform timing
})
export type Phase = z.infer<typeof Phase>

// ---------------------------------------------------------------------------
// Dosing rule — one selectable entry, selected by reference + band + age + indication
// ---------------------------------------------------------------------------
export const DosingRule = z.object({
  id: z.string(),
  referenceId: z.string(),
  indicationId: z.string().nullish(), // controlled id, not free text
  weightBand: Band.nullish(),
  ageBand: AgeBand.nullish(),
  priority: z.number().int().default(100), // explicit deterministic tie-break (lower wins)
  phases: z.array(Phase).min(1),
  maxSingleDose: Ceiling.nullish(),
  maxDailyDose: Ceiling.nullish(),
  absoluteCap: Ceiling.nullish(), // never exceed the adult dose
  defaultDurationDays: z.number().positive().nullish(),
  provenance: Provenance,
  notes: z.string().nullish(),
})
export type DosingRule = z.infer<typeof DosingRule>

// ---------------------------------------------------------------------------
// Formulations — discriminated union
// ---------------------------------------------------------------------------
const formBase = {
  id: z.string(),
  displayName: z.string(),
  routes: z.array(Route),
}

export const LiquidFormulation = z.object({
  ...formBase,
  kind: z.literal('liquid'),
  strength: Quantity, // 125 mg ...
  perVolume: Quantity, // ... per 5 mL  => concentration 25 mg/mL
  containerVolumeMl: z.number().positive(), // bottle size, for dispensing
  measurableIncrementMl: z.number().positive().default(0.5),
  reconstitution: z
    .object({ diluentMl: z.number(), finalConcentration: Quantity, perVolume: Quantity, stabilityNote: z.string().nullish() })
    .nullish(),
})

export const SolidFormulation = z.object({
  ...formBase,
  kind: z.literal('solid'),
  unit: z.enum(['tablet', 'capsule']),
  strengthPerUnit: Quantity,
  scored: z.boolean(),
  allowedFractions: z.array(z.number()), // [1, 0.5] scored; [1] unscored
  packSize: z.number().positive(),
})

export const SachetFormulation = z.object({
  ...formBase,
  kind: z.literal('sachet'),
  strengthPerSachet: Quantity,
  packSize: z.number().positive(),
})

export const ReconstitutedVialFormulation = z.object({
  ...formBase,
  kind: z.literal('reconstituted_vial'),
  powderStrength: Quantity, // 60 mg in the vial
  diluentMl: z.number().positive(),
  // Authored EXPLICITLY (powder displacement makes diluent-derived concentration wrong).
  finalConcentration: Quantity, // 10 mg ...
  perVolume: Quantity, // ... per 1 mL  => 10 mg/mL
  measurableIncrementMl: z.number().positive().default(0.1),
  packSize: z.number().positive(),
})

export const Formulation = z.discriminatedUnion('kind', [
  LiquidFormulation,
  SolidFormulation,
  SachetFormulation,
  ReconstitutedVialFormulation,
])
export type Formulation = z.infer<typeof Formulation>

// ---------------------------------------------------------------------------
// Drug aggregate
// ---------------------------------------------------------------------------
export const Drug = z.object({
  id: z.string(),
  name: z.string(),
  synonyms: z.array(z.string()).default([]),
  formulations: z.array(Formulation).min(1),
  rules: z.array(DosingRule).min(1),
  dataStatus: z.enum(['mock_for_ui_testing', 'verified_clinical']),
})
export type Drug = z.infer<typeof Drug>

export const Reference = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  editionId: z.string(),
  editionLabel: z.string(),
  preferred: z.boolean(),
  /** true => values are not yet populated; reference shown but disabled/empty. */
  notYetPopulated: z.boolean().default(false),
  /** true => proprietary source requiring a licensed login to populate. */
  licensed: z.boolean().default(false),
})
export type Reference = z.infer<typeof Reference>
