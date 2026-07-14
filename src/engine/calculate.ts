/**
 * calculate() — the one function that turns a validated CalcInput into a
 * CalculationResult. Pure and deterministic: same input, same output, no LLM,
 * no network, no clock. Every clinical number the app shows comes out of HERE.
 *
 * Pipeline:
 *   1. Plausibility guard      — refuse impossible inputs before any maths.
 *   2. selectRule              — deterministic band/age/indication match.
 *   3. Verification gate       — unverified data raises a loud danger warning.
 *   4. Target dose (mass)      — mg/kg or flat, per_dose or per_day; a RANGE
 *                                (amountMax) is carried as a low + high bound.
 *   5. Ceilings                — single-dose + daily caps, take the LOWER.
 *   6. Administration          — mass -> measurable mL / tablet count; a range
 *                                becomes "Give X–Y mL".
 *   7. Dispensing              — dispense for the UPPER bound of a range.
 *
 * Design decisions that each prevent a real error class:
 *  - A dose amount MUST be a mass (mg/mcg/g). IU/mmol/count amounts are refused
 *    with UNSUPPORTED_UNIT_DIMENSION rather than silently mishandled.
 *  - `absoluteCap` is treated as a DAILY ceiling (the adult maximum daily dose)
 *    and is combined with `maxDailyDose` by taking the lower resolved value.
 *  - A dose RANGE (STG age-band rules like paracetamol "120–250 mg") is never
 *    collapsed to a single number: both bounds flow through, and dispensing
 *    covers the upper bound so a course is never short.
 *  - A non-uniform regimen (multiple phases, or any phase with a free-text
 *    `schedule`) never gets a fabricated flat daily total: perDay is null.
 */
import type { Ceiling, DoseSpec, Formulation, Phase, Unit } from '../data/schema'
import type {
  Administration,
  CalcInput,
  CalculationResult,
  TargetDose,
  Warning,
  WarningCode,
  WarningSeverity,
} from './types'
import { selectRule } from './selectRule'
import {
  ceilWithEpsilon,
  dimensionOf,
  fromMg,
  round,
  roundToStep,
  snapToAllowedFraction,
  toMg,
  toMl,
} from './units'

// --- Plausibility bounds ----------------------------------------------------
const MIN_PLAUSIBLE_KG = 0.5
const MAX_PLAUSIBLE_KG = 150
const MAX_PLAUSIBLE_AGE_MONTHS = 18 * 12
const MAX_PLAUSIBLE_COURSE_DAYS = 60
const UNDER_DOSE_FRACTION = 0.9
const DISPENSE_MASS_HIGH_MG = 100_000
const EPS = 1e-9

function warn(code: WarningCode, severity: WarningSeverity, message: string): Warning {
  return { code, severity, message }
}

function blocked(reason: string, warnings: Warning[]): CalculationResult {
  return { status: 'blocked', blockedReason: reason, warnings }
}

/** Resolve a Ceiling to milligrams for the given weight, or null if absent/non-mass. */
function resolveCeilingMg(c: Ceiling | null | undefined, weightKg: number): number | null {
  if (!c) return null
  if (c.kind === 'absolute') return toMg(c.amount)
  const perKgMg = toMg(c.amountPerKg)
  return perKgMg == null ? null : perKgMg * weightKg
}

function primaryPhase(phases: Phase[]): Phase {
  return phases.find((p) => /mainten/i.test(p.label)) ?? phases[0]
}

function basisLabel(dose: DoseSpec, weightKg: number): string {
  const amt = dose.amount
  const range = dose.amountMax ? `${round(amt.value)}–${round(dose.amountMax.value)}` : `${round(amt.value)}`
  const per = dose.basis === 'per_dose' ? 'dose' : 'day'
  if (dose.perKg) return `${range} ${amt.unit}/kg/${per} × ${round(weightKg, 2)} kg`
  return `${range} ${amt.unit}/${per}`
}

interface DosePair {
  perDoseMg: number
  perDayMg: number
}

/** Raw per-dose / per-day mass before ceilings. */
function rawDose(amountMg: number, dose: DoseSpec, weightKg: number): DosePair {
  if (dose.basis === 'per_dose') {
    const perDoseMg = dose.perKg ? amountMg * weightKg : amountMg
    return { perDoseMg, perDayMg: perDoseMg * dose.frequencyPerDay }
  }
  const perDayMg = dose.perKg ? amountMg * weightKg : amountMg
  return { perDoseMg: perDayMg / dose.frequencyPerDay, perDayMg }
}

/**
 * Apply single-dose then daily ceilings (the daily cap = the LOWER of
 * maxDailyDose and absoluteCap). `emit` controls whether warnings are pushed —
 * we push once (for the low bound) and stay silent for the high bound so a
 * range doesn't duplicate every cap message.
 */
function applyCeilings(
  d: DosePair,
  freq: number,
  rule: CalcInput['rules'][number],
  weightKg: number,
  displayUnit: Unit,
  warnings: Warning[],
  emit: boolean,
): { d: DosePair; capApplied: boolean } {
  let { perDoseMg, perDayMg } = d
  let capApplied = false

  const singleCapMg = resolveCeilingMg(rule.maxSingleDose, weightKg)
  if (singleCapMg != null && perDoseMg > singleCapMg + EPS) {
    perDoseMg = singleCapMg
    perDayMg = perDoseMg * freq
    capApplied = true
    if (emit) warnings.push(warn('CAPPED_MAX_SINGLE', 'caution', `Per-dose capped to the maximum single dose (${round(singleCapMg)} ${displayUnit}).`))
  }

  const daily: Array<{ mg: number; code: WarningCode; label: string }> = []
  const maxDailyMg = resolveCeilingMg(rule.maxDailyDose, weightKg)
  if (maxDailyMg != null) daily.push({ mg: maxDailyMg, code: 'CAPPED_MAX_DAILY', label: 'maximum daily dose' })
  const absoluteMg = resolveCeilingMg(rule.absoluteCap, weightKg)
  if (absoluteMg != null) daily.push({ mg: absoluteMg, code: 'CAPPED_ABSOLUTE', label: 'absolute (adult) daily cap' })

  if (daily.length > 0) {
    const binding = daily.reduce((lo, c) => (c.mg < lo.mg ? c : lo))
    if (perDayMg > binding.mg + EPS) {
      perDayMg = binding.mg
      perDoseMg = perDayMg / freq
      capApplied = true
      if (emit) warnings.push(warn(binding.code, 'caution', `Daily total capped to the ${binding.label} (${round(binding.mg)} ${displayUnit}).`))
    }
  }

  return { d: { perDoseMg, perDayMg }, capApplied }
}

export function calculate(input: CalcInput): CalculationResult {
  const warnings: Warning[] = []
  const { weightKg, ageMonths } = input

  // --- 1. Plausibility guard ------------------------------------------------
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return blocked('Weight must be a number greater than 0 kg.', [
      warn('IMPLAUSIBLE_INPUT', 'danger', 'Enter the child’s weight in kilograms.'),
    ])
  }
  if (weightKg < MIN_PLAUSIBLE_KG || weightKg > MAX_PLAUSIBLE_KG) {
    warnings.push(
      warn('IMPLAUSIBLE_INPUT', 'danger', `A weight of ${round(weightKg, 2)} kg is outside the plausible range (${MIN_PLAUSIBLE_KG}–${MAX_PLAUSIBLE_KG} kg). Confirm the weight before use.`),
    )
  }
  if (ageMonths != null && (ageMonths < 0 || ageMonths > MAX_PLAUSIBLE_AGE_MONTHS)) {
    warnings.push(warn('IMPLAUSIBLE_INPUT', 'caution', `An age of ${round(ageMonths)} months is unusual for a paediatric tool. Confirm it.`))
  }

  // --- 2. Deterministic rule selection --------------------------------------
  const sel = selectRule(input.rules, {
    referenceId: input.referenceId,
    weightKg,
    ageMonths,
    indicationId: input.indicationId,
  })
  if (!sel.ok) {
    // A reference that doses by age band needs an age. When selection only tied
    // because the age is missing, say THAT — not the generic "fix the data".
    if (sel.reason === 'AMBIGUOUS_RULE' && ageMonths == null) {
      const ageBandedHere = input.rules.filter((r) => r.referenceId === input.referenceId && r.ageBand)
      if (ageBandedHere.length > 1) {
        const msg = 'Enter the child’s age — this reference doses by age band, so the age decides which dose applies.'
        return blocked(msg, [...warnings, warn('AGE_REQUIRED', 'danger', msg)])
      }
    }
    return blocked(sel.detail, [...warnings, warn(sel.reason, 'danger', sel.detail)])
  }
  const rule = sel.rule

  // --- 3. Verification gate -------------------------------------------------
  if (!rule.provenance.verified) {
    warnings.push(
      warn('UNVERIFIED_DATA', 'danger', `This rule is NOT verified against its primary source. ${rule.provenance.verificationNote} Do not use clinically until a pharmacist confirms it.`),
    )
  }

  // --- 4. Target dose (mass), low + optional high (range) -------------------
  const nonUniform = rule.phases.length > 1 || rule.phases.some((p) => p.schedule)
  const phase = primaryPhase(rule.phases)
  const dose = phase.dose
  const freq = dose.frequencyPerDay

  const amountMg = toMg(dose.amount)
  if (amountMg == null) {
    return blocked(
      `This rule’s dose is expressed in ${dose.amount.unit} (${dimensionOf(dose.amount.unit)}), which v1 cannot compute. Mass-based dosing only.`,
      [...warnings, warn('UNSUPPORTED_UNIT_DIMENSION', 'danger', 'Non-mass dose amount — refusing to compute.')],
    )
  }
  const displayUnit: Unit = dose.amount.unit

  const low = applyCeilings(rawDose(amountMg, dose, weightKg), freq, rule, weightKg, displayUnit, warnings, true)

  const amountMaxMg = dose.amountMax ? toMg(dose.amountMax) : null
  const high =
    amountMaxMg != null && amountMaxMg > amountMg + EPS
      ? applyCeilings(rawDose(amountMaxMg, dose, weightKg), freq, rule, weightKg, displayUnit, warnings, false)
      : null

  const targetDose: TargetDose = {
    perDose: { value: round(fromMg(low.d.perDoseMg, displayUnit), 3), unit: displayUnit },
    perDoseHigh: high ? { value: round(fromMg(high.d.perDoseMg, displayUnit), 3), unit: displayUnit } : null,
    perDay: nonUniform ? null : { value: round(fromMg(low.d.perDayMg, displayUnit), 3), unit: displayUnit },
    perDayHigh: high && !nonUniform ? { value: round(fromMg(high.d.perDayMg, displayUnit), 3), unit: displayUnit } : null,
    basisLabel: basisLabel(dose, weightKg),
    frequencyPerDay: freq,
    capApplied: low.capApplied || (high?.capApplied ?? false),
  }
  if (nonUniform) {
    warnings.push(warn('NON_UNIFORM_SCHEDULE', 'caution', 'This regimen is not a uniform daily schedule (loading/tapering or timed doses). A flat daily total is not shown; follow the schedule note.'))
  }

  // --- 6. Administration ----------------------------------------------------
  const measLow = measure(low.d.perDoseMg, displayUnit, input.formulation)
  if (!measLow) {
    return blocked('The selected formulation cannot deliver this dose (unit/dimension mismatch). Choose a formulation whose strength is a mass.', warnings)
  }
  for (const w of measLow.warnings) warnings.push(w)

  const admin: Administration = {
    kind: measLow.kind,
    instruction: measLow.instruction,
    value: measLow.value,
    unit: measLow.unit,
    deliveredMg: measLow.deliveredMg,
    exactValue: measLow.exactValue,
  }

  if (high) {
    const measHigh = measure(high.d.perDoseMg, displayUnit, input.formulation)
    if (measHigh) {
      admin.valueHigh = measHigh.value
      admin.deliveredMgHigh = measHigh.deliveredMg
      admin.exactValueHigh = measHigh.exactValue
      admin.instruction = rangeInstruction(measLow, measHigh)
      // surface any high-bound-only warnings (dedupe by code)
      for (const w of measHigh.warnings) {
        if (!warnings.some((x) => x.code === w.code)) warnings.push(w)
      }
    }
  }

  // --- 7. Dispensing — cover the UPPER bound of a range ---------------------
  const courseDays = input.courseDays ?? rule.defaultDurationDays ?? phase.durationDays ?? null
  const dispenseValue = admin.valueHigh ?? admin.value
  const dispenseDeliveredMg = admin.deliveredMgHigh ?? admin.deliveredMg
  const dispensing =
    courseDays != null
      ? buildDispensing(admin.kind, dispenseValue, dispenseDeliveredMg, admin.unit, courseDays, freq, input.formulation, warnings)
      : undefined

  return {
    status: 'ok',
    appliedRule: rule,
    provenance: rule.provenance,
    targetDose,
    administration: admin,
    dispensing,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// measure(): one per-dose mass -> a measurable quantity for the formulation.
// Pure — returns its own warnings so the caller controls what surfaces.
// ---------------------------------------------------------------------------
interface Measurement {
  kind: 'volume' | 'units'
  instruction: string
  value: number
  unit: string
  deliveredMg: number
  exactValue: number
  warnings: Warning[]
}

function measure(perDoseMg: number, displayUnit: Unit, f: Formulation): Measurement | null {
  const ws: Warning[] = []
  switch (f.kind) {
    case 'liquid':
    case 'reconstituted_vial': {
      const strengthMg = f.kind === 'liquid' ? toMg(f.strength) : toMg(f.finalConcentration)
      const perMl = toMl(f.perVolume)
      if (strengthMg == null || perMl == null || perMl === 0) return null
      const concMgPerMl = strengthMg / perMl
      const step = f.measurableIncrementMl
      const exactMl = perDoseMg / concMgPerMl
      const ml = roundToStep(exactMl, step)

      if (ml <= 0) {
        ws.push(warn('UNMEASURABLE', 'danger', `The dose (${round(perDoseMg)} ${displayUnit}) is smaller than the smallest measurable volume (${step} mL). Use a more dilute formulation or confirm the dose.`))
      } else if (Math.abs(ml - exactMl) > 1e-6) {
        ws.push(warn('ROUNDED_FOR_MEASURABILITY', 'info', `Volume rounded to the nearest ${step} mL for measurement.`))
      }
      const deliveredMg = ml * concMgPerMl
      if (ml > 0 && deliveredMg < perDoseMg * UNDER_DOSE_FRACTION) {
        ws.push(warn('UNDER_DOSE_AFTER_ROUNDING', 'caution', `After rounding, the delivered dose (${round(deliveredMg)} ${displayUnit}) is notably below target.`))
      }
      return { kind: 'volume', instruction: ml > 0 ? `Give ${round(ml, 2)} mL` : 'Dose too small to measure with this formulation', value: round(ml, 2), unit: 'mL', deliveredMg: round(deliveredMg, 2), exactValue: round(exactMl, 3), warnings: ws }
    }

    case 'solid': {
      const strengthMg = toMg(f.strengthPerUnit)
      if (strengthMg == null || strengthMg === 0) return null
      const exactUnits = perDoseMg / strengthMg
      const { snapped, requiresDisallowedSplit } = snapToAllowedFraction(exactUnits, f.allowedFractions)
      if (requiresDisallowedSplit) {
        ws.push(warn('DISALLOWED_TABLET_SPLIT', 'caution', `An exact dose needs a split this ${f.unit} does not allow (${f.scored ? 'scored' : 'unscored'}). Rounded to ${snapped} ${f.unit}.`))
      } else if (Math.abs(snapped - exactUnits) > 1e-6) {
        ws.push(warn('ROUNDED_FOR_MEASURABILITY', 'info', `Rounded to ${snapped} ${f.unit}.`))
      }
      if (snapped <= 0) {
        ws.push(warn('UNMEASURABLE', 'danger', `The dose is smaller than the smallest usable fraction of one ${f.unit}. Use a liquid or lower-strength ${f.unit}.`))
      }
      const deliveredMg = snapped * strengthMg
      if (snapped > 0 && deliveredMg < perDoseMg * UNDER_DOSE_FRACTION) {
        ws.push(warn('UNDER_DOSE_AFTER_ROUNDING', 'caution', `After rounding, the delivered dose (${round(deliveredMg)} ${displayUnit}) is notably below target.`))
      }
      const label = `${snapped} ${f.unit}${snapped === 1 ? '' : 's'}`
      return { kind: 'units', instruction: snapped > 0 ? `Give ${label}` : `Dose too small for this ${f.unit}`, value: snapped, unit: f.unit, deliveredMg: round(deliveredMg, 2), exactValue: round(exactUnits, 3), warnings: ws }
    }

    case 'sachet': {
      const strengthMg = toMg(f.strengthPerSachet)
      if (strengthMg == null || strengthMg === 0) return null
      const exactSachets = perDoseMg / strengthMg
      const sachets = Math.max(0, Math.round(exactSachets))
      if (Math.abs(sachets - exactSachets) > 1e-6) {
        ws.push(warn('ROUNDED_FOR_MEASURABILITY', 'caution', `Rounded to ${sachets} whole sachet${sachets === 1 ? '' : 's'}.`))
      }
      const deliveredMg = sachets * strengthMg
      return { kind: 'units', instruction: `Give ${sachets} sachet${sachets === 1 ? '' : 's'}`, value: sachets, unit: 'sachet', deliveredMg: round(deliveredMg, 2), exactValue: round(exactSachets, 3), warnings: ws }
    }
  }
}

/** "Give 2–4 mL" / "Give 1–2 tablets" for a dose range. */
function rangeInstruction(lo: Measurement, hi: Measurement): string {
  if (lo.value <= 0 && hi.value <= 0) return lo.instruction
  if (lo.kind === 'volume') return `Give ${lo.value}–${hi.value} mL`
  const plural = hi.value === 1 ? '' : 's'
  return `Give ${lo.value}–${hi.value} ${lo.unit}${plural}`
}

// ---------------------------------------------------------------------------
// Dispensing: measurable per-dose quantity -> total for the course -> packs
// ---------------------------------------------------------------------------
function buildDispensing(
  kind: 'volume' | 'units',
  perDoseValue: number,
  perDoseDeliveredMg: number,
  unit: string,
  courseDays: number,
  frequencyPerDay: number,
  f: Formulation,
  warnings: Warning[],
) {
  const totalDoses = frequencyPerDay * courseDays
  const totalUnits = perDoseValue * totalDoses
  const totalMassMg = perDoseDeliveredMg * totalDoses

  if (courseDays > MAX_PLAUSIBLE_COURSE_DAYS) {
    warnings.push(warn('DISPENSE_MASS_HIGH', 'caution', `A ${round(courseDays)}-day course is unusually long — confirm the intended duration.`))
  }
  if (totalMassMg > DISPENSE_MASS_HIGH_MG) {
    warnings.push(warn('DISPENSE_MASS_HIGH', 'caution', `The total dispensed amount is very large (${round(totalMassMg)} mg over the course). Confirm before dispensing.`))
  }

  let totalLabel: string
  let packLabel: string
  let packs: number

  if (kind === 'volume') {
    const totalMl = round(totalUnits, 1)
    if (f.kind === 'liquid' || f.kind === 'reconstituted_vial') {
      const container = f.kind === 'liquid' ? f.containerVolumeMl : f.diluentMl
      packs = ceilWithEpsilon(totalMl / container)
      const noun = f.kind === 'liquid' ? 'bottle' : 'vial'
      packLabel = `${packs} ${noun}${packs === 1 ? '' : 's'} (${round(container, 1)} mL each)`
    } else {
      packs = 1
      packLabel = `${totalMl} mL`
    }
    totalLabel = `${totalMl} mL`
  } else {
    const totalCount = Math.ceil(totalUnits)
    const packSize = 'packSize' in f ? f.packSize : totalCount
    packs = ceilWithEpsilon(totalCount / packSize)
    totalLabel = `${totalCount} ${unit}${totalCount === 1 ? '' : 's'}`
    packLabel = `${packs} pack${packs === 1 ? '' : 's'} of ${packSize}`
  }

  return { courseDays, totalLabel, packLabel, packs, totalMassMg: round(totalMassMg, 1) }
}
