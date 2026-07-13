/** Engine input/output contracts. One CalculationResult serves all three roles. */
import type { DosingRule, Formulation, Quantity, Provenance } from '../data/schema'

export interface CalcInput {
  rules: DosingRule[] // all rules for the chosen drug (any reference)
  referenceId: string
  weightKg: number
  ageMonths?: number | null
  indicationId?: string | null
  formulation: Formulation
  courseDays?: number | null // optional; falls back to rule.defaultDurationDays
}

export type WarningSeverity = 'info' | 'caution' | 'danger'

export type WarningCode =
  | 'UNVERIFIED_DATA'
  | 'NO_RULE_MATCH'
  | 'AMBIGUOUS_RULE'
  | 'CAPPED_MAX_SINGLE'
  | 'CAPPED_MAX_DAILY'
  | 'CAPPED_ABSOLUTE'
  | 'ROUNDED_FOR_MEASURABILITY'
  | 'UNDER_DOSE_AFTER_ROUNDING'
  | 'UNMEASURABLE'
  | 'DISALLOWED_TABLET_SPLIT'
  | 'NON_UNIFORM_SCHEDULE'
  | 'DAILY_CAP_NOT_EVALUATED'
  | 'UNSUPPORTED_UNIT_DIMENSION'
  | 'IMPLAUSIBLE_INPUT'
  | 'DISPENSE_MASS_HIGH'

export interface Warning {
  code: WarningCode
  severity: WarningSeverity
  message: string
}

export interface TargetDose {
  perDose: Quantity
  perDay: Quantity | null // null when a non-uniform schedule makes a flat daily total unsafe
  basisLabel: string // "3 mg/kg/dose x 10 kg"
  frequencyPerDay: number
  capApplied: boolean
}

export interface Administration {
  kind: 'volume' | 'units'
  /** Primary human instruction, e.g. "Draw 3 mL" / "Give half a tablet". */
  instruction: string
  value: number // measurable mL or unit count
  unit: string // 'mL' | 'tablet' | ...
  deliveredMg: number // mass actually delivered after rounding
  exactValue: number // pre-rounding value (for transparency)
}

export interface Dispensing {
  courseDays: number
  totalLabel: string // "60 mL" / "12 tablets"
  packLabel: string // "1 bottle (100 mL)" / "1 pack of 21"
  packs: number
  totalMassMg: number // surfaced for the deliberate-overdose guard
}

export interface CalculationResult {
  status: 'ok' | 'blocked'
  blockedReason?: string
  appliedRule?: DosingRule
  provenance?: Provenance
  targetDose?: TargetDose
  administration?: Administration
  dispensing?: Dispensing
  warnings: Warning[]
}
