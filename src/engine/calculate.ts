/**
 * calculate() — the one function that turns a validated CalcInput into a
 * CalculationResult. It is deliberately pure and deterministic: same input,
 * same output, no LLM, no network, no clock. Every clinical number the app
 * ever shows a nurse comes out of HERE, so the invariants are strict.
 *
 * Pipeline:
 *   1. Plausibility guard      — refuse impossible inputs before any maths.
 *   2. selectRule              — deterministic band/age/indication match.
 *   3. Verification gate       — unverified data raises a loud danger warning.
 *   4. Target dose (mass)      — mg/kg or flat, per_dose or per_day.
 *   5. Ceilings                — single-dose + daily caps, take the LOWER.
 *   6. Administration          — mass -> measurable mL / tablet count.
 *   7. Dispensing              — per-dose quantity -> whole packs for a course.
 *
 * Design decisions worth stating out loud (each prevents a real error class):
 *  - A dose amount MUST be a mass (mg/mcg/g). IU/mmol/count amounts are refused
 *    with UNSUPPORTED_UNIT_DIMENSION rather than silently mishandled. Weight-band
 *    "give N whole tablets" combination drugs (e.g. artemether-lumefantrine) are
 *    therefore out of scope for v1 and must be added deliberately later.
 *  - `absoluteCap` is treated as a DAILY ceiling (the adult maximum daily dose)
 *    and is combined with `maxDailyDose` by taking the lower resolved value.
 *    This is what makes paracetamol's 75 mg/kg/day cap bind for a small child
 *    while the 4000 mg/day adult cap binds for a heavy adolescent.
 *  - A non-uniform regimen (multiple phases, or any phase with a free-text
 *    `schedule`) never gets a fabricated flat daily total: perDay is null and a
 *    NON_UNIFORM_SCHEDULE warning fires. v1 computes the maintenance phase only.
 */
import type { Ceiling, DoseSpec, Formulation, Phase, Quantity, Unit } from '../data/schema'
import type {
  Administration,
  CalcInput,
  CalculationResult,
  Dispensing,
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

// --- Plausibility bounds (warn, don't silently accept) ----------------------
const MIN_PLAUSIBLE_KG = 0.5
const MAX_PLAUSIBLE_KG = 150
const MAX_PLAUSIBLE_AGE_MONTHS = 18 * 12 // this is a paediatric tool
const MAX_PLAUSIBLE_COURSE_DAYS = 60
// Under-dose guard: flag when rounding delivers materially less than intended.
const UNDER_DOSE_FRACTION = 0.9
// Coarse deliberate-overdose guard on a whole dispensed course.
const DISPENSE_MASS_HIGH_MG = 100_000

function warn(code: WarningCode, severity: WarningSeverity, message: string): Warning {
  return { code, severity, message }
}

function blocked(reason: string, warnings: Warning[]): CalculationResult {
  return { status: 'blocked', blockedReason: reason, warnings }
}

/** Resolve a Ceiling to milligrams for the given weight, or null if not present/mass. */
function resolveCeilingMg(c: Ceiling | null | undefined, weightKg: number): number | null {
  if (!c) return null
  if (c.kind === 'absolute') return toMg(c.amount)
  const perKgMg = toMg(c.amountPerKg)
  return perKgMg == null ? null : perKgMg * weightKg
}

/** Pick the phase v1 computes: prefer an explicit maintenance phase, else the first. */
function primaryPhase(phases: Phase[]): Phase {
  return phases.find((p) => /mainten/i.test(p.label)) ?? phases[0]
}

/** Human basis string, e.g. "15 mg/kg/dose × 10 kg" or "10–15 mg/kg/dose × 10 kg". */
function basisLabel(dose: DoseSpec, weightKg: number): string {
  const amt = dose.amount
  const range = dose.amountMax ? `${round(amt.value)}–${round(dose.amountMax.value)}` : `${round(amt.value)}`
  const per = dose.basis === 'per_dose' ? 'dose' : 'day'
  if (dose.perKg) return `${range} ${amt.unit}/kg/${per} × ${round(weightKg, 2)} kg`
  return `${range} ${amt.unit}/${per}`
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
      warn(
        'IMPLAUSIBLE_INPUT',
        'danger',
        `A weight of ${round(weightKg, 2)} kg is outside the plausible range (${MIN_PLAUSIBLE_KG}–${MAX_PLAUSIBLE_KG} kg). Confirm the weight before use.`,
      ),
    )
  }
  if (ageMonths != null && (ageMonths < 0 || ageMonths > MAX_PLAUSIBLE_AGE_MONTHS)) {
    warnings.push(
      warn('IMPLAUSIBLE_INPUT', 'caution', `An age of ${round(ageMonths)} months is unusual for a paediatric tool. Confirm it.`),
    )
  }

  // --- 2. Deterministic rule selection --------------------------------------
  const sel = selectRule(input.rules, {
    referenceId: input.referenceId,
    weightKg,
    ageMonths,
    indicationId: input.indicationId,
  })
  if (!sel.ok) {
    return blocked(sel.detail, [...warnings, warn(sel.reason, 'danger', sel.detail)])
  }
  const rule = sel.rule

  // --- 3. Verification gate -------------------------------------------------
  // v1 computes-and-warns; a future "clinical mode" would turn this into a hard
  // block. Either way the number is never presented as trustworthy silently.
  if (!rule.provenance.verified) {
    warnings.push(
      warn(
        'UNVERIFIED_DATA',
        'danger',
        `This rule is NOT verified against its primary source. ${rule.provenance.verificationNote} Do not use clinically until a pharmacist confirms it.`,
      ),
    )
  }

  // --- 4. Target dose (mass) ------------------------------------------------
  const nonUniform = rule.phases.length > 1 || rule.phases.some((p) => p.schedule)
  const phase = primaryPhase(rule.phases)
  const dose = phase.dose
  const frequencyPerDay = dose.frequencyPerDay

  const amountMg = toMg(dose.amount)
  if (amountMg == null) {
    return blocked(
      `This rule’s dose is expressed in ${dose.amount.unit} (${dimensionOf(dose.amount.unit)}), which v1 cannot compute. Mass-based dosing (mg/kg or a flat mg dose) only.`,
      [...warnings, warn('UNSUPPORTED_UNIT_DIMENSION', 'danger', 'Non-mass dose amount — refusing to compute.')],
    )
  }
  const displayUnit: Unit = dose.amount.unit // pin display to how the rule was authored

  let perDoseMg: number
  let perDayMg: number
  if (dose.basis === 'per_dose') {
    perDoseMg = dose.perKg ? amountMg * weightKg : amountMg
    perDayMg = perDoseMg * frequencyPerDay
  } else {
    perDayMg = dose.perKg ? amountMg * weightKg : amountMg
    perDoseMg = perDayMg / frequencyPerDay
  }

  // --- 5. Ceilings — apply single-dose cap, then daily cap (lower wins) ------
  let capApplied = false

  const singleCapMg = resolveCeilingMg(rule.maxSingleDose, weightKg)
  if (singleCapMg != null && perDoseMg > singleCapMg + 1e-9) {
    perDoseMg = singleCapMg
    perDayMg = perDoseMg * frequencyPerDay
    capApplied = true
    warnings.push(warn('CAPPED_MAX_SINGLE', 'caution', `Per-dose capped to the maximum single dose (${round(singleCapMg)} ${displayUnit}).`))
  }

  // Daily ceiling = the LOWER of maxDailyDose and absoluteCap (adult daily max).
  const dailyCandidates: Array<{ mg: number; code: WarningCode; label: string }> = []
  const maxDailyMg = resolveCeilingMg(rule.maxDailyDose, weightKg)
  if (maxDailyMg != null) dailyCandidates.push({ mg: maxDailyMg, code: 'CAPPED_MAX_DAILY', label: 'maximum daily dose' })
  const absoluteMg = resolveCeilingMg(rule.absoluteCap, weightKg)
  if (absoluteMg != null) dailyCandidates.push({ mg: absoluteMg, code: 'CAPPED_ABSOLUTE', label: 'absolute (adult) daily cap' })

  if (dailyCandidates.length > 0) {
    const binding = dailyCandidates.reduce((lo, c) => (c.mg < lo.mg ? c : lo))
    if (perDayMg > binding.mg + 1e-9) {
      perDayMg = binding.mg
      perDoseMg = perDayMg / frequencyPerDay // spread the capped daily total across the doses
      capApplied = true
      warnings.push(warn(binding.code, 'caution', `Daily total capped to the ${binding.label} (${round(binding.mg)} ${displayUnit}).`))
    }
  }

  const targetDose: TargetDose = {
    perDose: { value: round(fromMg(perDoseMg, displayUnit), 3), unit: displayUnit },
    perDay: nonUniform ? null : { value: round(fromMg(perDayMg, displayUnit), 3), unit: displayUnit },
    basisLabel: basisLabel(dose, weightKg),
    frequencyPerDay,
    capApplied,
  }
  if (nonUniform) {
    warnings.push(
      warn(
        'NON_UNIFORM_SCHEDULE',
        'caution',
        'This regimen is not a uniform daily schedule (loading/tapering or timed doses). A flat daily total is not shown; follow the schedule note.',
      ),
    )
  }

  // --- 6. Administration — mass per dose -> measurable quantity --------------
  const admin = buildAdministration(perDoseMg, displayUnit, input.formulation, warnings)
  if (!admin) {
    return blocked(
      `The selected formulation cannot deliver this dose (unit/dimension mismatch). Choose a formulation whose strength is a mass.`,
      warnings,
    )
  }

  // --- 7. Dispensing — whole packs for the course ---------------------------
  const courseDays = input.courseDays ?? rule.defaultDurationDays ?? phase.durationDays ?? null
  const dispensing =
    courseDays != null ? buildDispensing(admin, courseDays, frequencyPerDay, input.formulation, warnings) : undefined

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
// Administration: turn a per-dose mass into something a nurse can actually give
// ---------------------------------------------------------------------------
function buildAdministration(
  perDoseMg: number,
  displayUnit: Unit,
  f: Formulation,
  warnings: Warning[],
): Administration | null {
  switch (f.kind) {
    case 'liquid':
    case 'reconstituted_vial': {
      // mg per mL from the (final) concentration.
      const strengthMg = f.kind === 'liquid' ? toMg(f.strength) : toMg(f.finalConcentration)
      const perMl = toMl(f.perVolume)
      if (strengthMg == null || perMl == null || perMl === 0) return null
      const concMgPerMl = strengthMg / perMl
      const step = f.measurableIncrementMl
      const exactMl = perDoseMg / concMgPerMl
      const ml = roundToStep(exactMl, step)

      if (ml <= 0) {
        warnings.push(
          warn('UNMEASURABLE', 'danger', `The dose (${round(perDoseMg)} ${displayUnit}) is smaller than the smallest measurable volume (${step} mL). Use a more dilute formulation or confirm the dose.`),
        )
      } else if (Math.abs(ml - exactMl) > 1e-6) {
        warnings.push(warn('ROUNDED_FOR_MEASURABILITY', 'info', `Volume rounded to the nearest ${step} mL for measurement.`))
      }

      const deliveredMg = ml * concMgPerMl
      if (ml > 0 && deliveredMg < perDoseMg * UNDER_DOSE_FRACTION) {
        warnings.push(warn('UNDER_DOSE_AFTER_ROUNDING', 'caution', `After rounding, the delivered dose (${round(deliveredMg)} ${displayUnit}) is notably below target.`))
      }

      return {
        kind: 'volume',
        instruction: ml > 0 ? `Give ${round(ml, 2)} mL` : `Dose too small to measure with this formulation`,
        value: round(ml, 2),
        unit: 'mL',
        deliveredMg: round(deliveredMg, 2),
        exactValue: round(exactMl, 3),
      }
    }

    case 'solid': {
      const strengthMg = toMg(f.strengthPerUnit)
      if (strengthMg == null || strengthMg === 0) return null
      const exactUnits = perDoseMg / strengthMg
      const { snapped, requiresDisallowedSplit } = snapToAllowedFraction(exactUnits, f.allowedFractions)

      if (requiresDisallowedSplit) {
        warnings.push(
          warn('DISALLOWED_TABLET_SPLIT', 'caution', `An exact dose needs a split this ${f.unit} does not allow (${f.scored ? 'scored' : 'unscored'}). Rounded to ${snapped} ${f.unit}.`),
        )
      } else if (Math.abs(snapped - exactUnits) > 1e-6) {
        warnings.push(warn('ROUNDED_FOR_MEASURABILITY', 'info', `Rounded to ${snapped} ${f.unit}.`))
      }
      if (snapped <= 0) {
        warnings.push(warn('UNMEASURABLE', 'danger', `The dose is smaller than the smallest usable fraction of one ${f.unit}. Use a liquid or lower-strength ${f.unit}.`))
      }

      const deliveredMg = snapped * strengthMg
      if (snapped > 0 && deliveredMg < perDoseMg * UNDER_DOSE_FRACTION) {
        warnings.push(warn('UNDER_DOSE_AFTER_ROUNDING', 'caution', `After rounding, the delivered dose (${round(deliveredMg)} ${displayUnit}) is notably below target.`))
      }

      const label = `${snapped} ${f.unit}${snapped === 1 ? '' : 's'}`
      return {
        kind: 'units',
        instruction: snapped > 0 ? `Give ${label}` : `Dose too small for this ${f.unit}`,
        value: snapped,
        unit: f.unit,
        deliveredMg: round(deliveredMg, 2),
        exactValue: round(exactUnits, 3),
      }
    }

    case 'sachet': {
      const strengthMg = toMg(f.strengthPerSachet)
      if (strengthMg == null || strengthMg === 0) return null
      const exactSachets = perDoseMg / strengthMg
      const sachets = Math.max(0, Math.round(exactSachets)) // sachets are whole
      if (Math.abs(sachets - exactSachets) > 1e-6) {
        warnings.push(warn('ROUNDED_FOR_MEASURABILITY', 'caution', `Rounded to ${sachets} whole sachet${sachets === 1 ? '' : 's'}.`))
      }
      const deliveredMg = sachets * strengthMg
      return {
        kind: 'units',
        instruction: `Give ${sachets} sachet${sachets === 1 ? '' : 's'}`,
        value: sachets,
        unit: 'sachet',
        deliveredMg: round(deliveredMg, 2),
        exactValue: round(exactSachets, 3),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dispensing: per-dose measurable quantity -> total for the course -> packs
// ---------------------------------------------------------------------------
function buildDispensing(
  admin: Administration,
  courseDays: number,
  frequencyPerDay: number,
  f: Formulation,
  warnings: Warning[],
): Dispensing {
  const totalDoses = frequencyPerDay * courseDays
  const totalUnits = admin.value * totalDoses
  const totalMassMg = admin.deliveredMg * totalDoses

  if (courseDays > MAX_PLAUSIBLE_COURSE_DAYS) {
    warnings.push(warn('DISPENSE_MASS_HIGH', 'caution', `A ${round(courseDays)}-day course is unusually long — confirm the intended duration.`))
  }
  if (totalMassMg > DISPENSE_MASS_HIGH_MG) {
    warnings.push(warn('DISPENSE_MASS_HIGH', 'caution', `The total dispensed amount is very large (${round(totalMassMg)} mg over the course). Confirm before dispensing.`))
  }

  let totalLabel: string
  let packLabel: string
  let packs: number

  if (admin.kind === 'volume') {
    const totalMl = round(totalUnits, 1)
    if (f.kind === 'liquid' || f.kind === 'reconstituted_vial') {
      const container = f.kind === 'liquid' ? f.containerVolumeMl : f.diluentMl // vial: made-up volume ≈ diluent
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
    const noun = admin.unit
    totalLabel = `${totalCount} ${noun}${totalCount === 1 ? '' : 's'}`
    packLabel = `${packs} pack${packs === 1 ? '' : 's'} of ${packSize}`
  }

  return { courseDays, totalLabel, packLabel, packs, totalMassMg: round(totalMassMg, 1) }
}
