/**
 * Engine tests. These are the safety net: every claim calculate() makes about a
 * dose is pinned here, so a regression fails the build instead of reaching a
 * child. Fixtures are built inline (not from seed data) so the maths under test
 * is independent of whatever drug data ships.
 */
import { describe, expect, it } from 'vitest'
import type { DosingRule, Formulation, Provenance } from '../data/schema'
import type { CalcInput } from './types'
import { calculate } from './calculate'

const REF = 'ghana-stg-2017'

function prov(verified = true): Provenance {
  return {
    referenceId: REF,
    editionId: '2017',
    citation: 'TEST fixture',
    verified,
    verificationNote: 'Test fixture — not a real citation.',
  }
}

/** Paracetamol suspension 120 mg / 5 mL => 24 mg/mL, 100 mL bottle, 0.5 mL grid. */
const paraSusp: Formulation = {
  id: 'para-susp-120',
  displayName: 'Paracetamol 120 mg/5 mL suspension',
  routes: ['oral'],
  kind: 'liquid',
  strength: { value: 120, unit: 'mg' },
  perVolume: { value: 5, unit: 'mL' },
  containerVolumeMl: 100,
  measurableIncrementMl: 0.5,
}

/** 250 mg scored tablet, halves allowed, pack of 20. */
const tab250Scored: Formulation = {
  id: 'tab-250-scored',
  displayName: '250 mg scored tablet',
  routes: ['oral'],
  kind: 'solid',
  unit: 'tablet',
  strengthPerUnit: { value: 250, unit: 'mg' },
  scored: true,
  allowedFractions: [1, 0.5],
  packSize: 20,
}

const tab250Unscored: Formulation = { ...tab250Scored, id: 'tab-250-unscored', scored: false, allowedFractions: [1] }

/** A paracetamol-like rule: 20 mg/kg/dose q6h, 75 mg/kg/day + 4000 mg/day caps. */
function paraRule(): DosingRule {
  return {
    id: 'para-main',
    referenceId: REF,
    priority: 100,
    phases: [
      {
        label: 'maintenance',
        dose: { basis: 'per_dose', perKg: true, amount: { value: 20, unit: 'mg' }, frequencyPerDay: 4, route: 'oral' },
      },
    ],
    maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } },
    absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
    defaultDurationDays: 3,
    provenance: prov(),
  }
}

function baseInput(over: Partial<CalcInput> = {}): CalcInput {
  return {
    rules: [paraRule()],
    referenceId: REF,
    weightKg: 10,
    formulation: paraSusp,
    ...over,
  }
}

describe('calculate — ceilings', () => {
  it('binds the 75 mg/kg/day cap for a small child', () => {
    // 20 mg/kg/dose × 4 = 80 mg/kg/day (raw 800 mg) > 75 mg/kg/day (750 mg for 10 kg).
    const r = calculate(baseInput({ weightKg: 10 }))
    expect(r.status).toBe('ok')
    expect(r.targetDose?.perDay?.value).toBe(750)
    expect(r.targetDose?.perDose.value).toBe(187.5) // 750 / 4
    expect(r.targetDose?.capApplied).toBe(true)
    expect(r.warnings.map((w) => w.code)).toContain('CAPPED_MAX_DAILY')
  })

  it('binds the 4000 mg/day absolute cap for a heavy adolescent', () => {
    // 60 kg: per-kg daily = 4500 mg, absolute = 4000 mg => absolute is the lower.
    const r = calculate(baseInput({ weightKg: 60 }))
    expect(r.status).toBe('ok')
    expect(r.targetDose?.perDay?.value).toBe(4000)
    expect(r.targetDose?.perDose.value).toBe(1000)
    expect(r.warnings.map((w) => w.code)).toContain('CAPPED_ABSOLUTE')
  })

  it('applies no cap when the dose is within limits', () => {
    // 10 mg/kg/dose × 4 = 40 mg/kg/day = 400 mg < 750 mg cap.
    const rule = paraRule()
    rule.phases[0].dose.amount = { value: 10, unit: 'mg' }
    const r = calculate(baseInput({ rules: [rule], weightKg: 10 }))
    expect(r.targetDose?.capApplied).toBe(false)
    expect(r.targetDose?.perDose.value).toBe(100)
    expect(r.targetDose?.perDay?.value).toBe(400)
    expect(r.warnings.map((w) => w.code)).not.toContain('CAPPED_MAX_DAILY')
  })

  it('caps a single dose independently of the daily cap', () => {
    const rule = paraRule()
    rule.phases[0].dose = { basis: 'per_dose', perKg: true, amount: { value: 10, unit: 'mg' }, frequencyPerDay: 4, route: 'oral' }
    rule.maxSingleDose = { kind: 'absolute', amount: { value: 80, unit: 'mg' } }
    rule.maxDailyDose = undefined
    rule.absoluteCap = undefined
    const r = calculate(baseInput({ rules: [rule], weightKg: 10 })) // raw 100 mg/dose -> capped 80
    expect(r.targetDose?.perDose.value).toBe(80)
    expect(r.warnings.map((w) => w.code)).toContain('CAPPED_MAX_SINGLE')
  })
})

describe('calculate — administration (liquid)', () => {
  it('converts mass to a measurable volume and rounds to the grid', () => {
    const rule = paraRule()
    rule.phases[0].dose.amount = { value: 10, unit: 'mg' } // 100 mg/dose for 10 kg
    const r = calculate(baseInput({ rules: [rule], weightKg: 10 }))
    // 100 mg / 24 mg/mL = 4.1667 mL -> nearest 0.5 mL = 4.0 mL
    expect(r.administration?.kind).toBe('volume')
    expect(r.administration?.value).toBe(4)
    expect(r.administration?.exactValue).toBeCloseTo(4.167, 2)
    expect(r.administration?.deliveredMg).toBe(96)
    expect(r.warnings.map((w) => w.code)).toContain('ROUNDED_FOR_MEASURABILITY')
  })

  it('flags an unmeasurably small dose', () => {
    const rule = paraRule()
    rule.phases[0].dose = { basis: 'per_dose', perKg: false, amount: { value: 2, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' }
    rule.maxDailyDose = undefined
    rule.absoluteCap = undefined
    const r = calculate(baseInput({ rules: [rule] })) // 2 mg / 24 mg/mL = 0.083 mL -> rounds to 0
    expect(r.warnings.map((w) => w.code)).toContain('UNMEASURABLE')
  })
})

describe('calculate — administration (solid)', () => {
  it('gives a clean half on a scored tablet', () => {
    const rule = paraRule()
    rule.phases[0].dose = { basis: 'per_dose', perKg: false, amount: { value: 125, unit: 'mg' }, frequencyPerDay: 2, route: 'oral' }
    rule.maxDailyDose = undefined
    rule.absoluteCap = undefined
    const r = calculate(baseInput({ rules: [rule], formulation: tab250Scored }))
    expect(r.administration?.value).toBe(0.5)
    expect(r.administration?.unit).toBe('tablet')
    expect(r.warnings.map((w) => w.code)).not.toContain('DISALLOWED_TABLET_SPLIT')
  })

  it('flags a split an unscored tablet cannot make', () => {
    const rule = paraRule()
    rule.phases[0].dose = { basis: 'per_dose', perKg: false, amount: { value: 125, unit: 'mg' }, frequencyPerDay: 2, route: 'oral' }
    rule.maxDailyDose = undefined
    rule.absoluteCap = undefined
    const r = calculate(baseInput({ rules: [rule], formulation: tab250Unscored }))
    expect(r.warnings.map((w) => w.code)).toContain('DISALLOWED_TABLET_SPLIT')
  })
})

describe('calculate — dispensing', () => {
  it('rounds a course up to whole bottles', () => {
    const rule = paraRule()
    rule.phases[0].dose.amount = { value: 10, unit: 'mg' } // 4 mL/dose, q6h
    const r = calculate(baseInput({ rules: [rule], weightKg: 10, courseDays: 3 }))
    // 4 mL × 4 doses × 3 days = 48 mL -> 1 × 100 mL bottle
    expect(r.dispensing?.courseDays).toBe(3)
    expect(r.dispensing?.totalLabel).toBe('48 mL')
    expect(r.dispensing?.packs).toBe(1)
  })
})

describe('calculate — selection & guards', () => {
  it('blocks when no rule matches the weight band', () => {
    const rule = paraRule()
    rule.weightBand = { minKgIncl: 30, maxKgExcl: 50 }
    const r = calculate(baseInput({ rules: [rule], weightKg: 10 }))
    expect(r.status).toBe('blocked')
    expect(r.warnings.map((w) => w.code)).toContain('NO_RULE_MATCH')
  })

  it('blocks on an ambiguous rule tie', () => {
    const a = paraRule()
    const b = { ...paraRule(), id: 'para-dup' }
    const r = calculate(baseInput({ rules: [a, b], weightKg: 10 }))
    expect(r.status).toBe('blocked')
    expect(r.warnings.map((w) => w.code)).toContain('AMBIGUOUS_RULE')
  })

  it('selects the age-appropriate band', () => {
    const infant: DosingRule = {
      id: 'zinc-infant',
      referenceId: REF,
      ageBand: { minMonthsIncl: 0, maxMonthsExcl: 6 },
      priority: 100,
      phases: [{ label: 'maintenance', dose: { basis: 'per_day', perKg: false, amount: { value: 10, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' } }],
      provenance: prov(),
    }
    const child: DosingRule = {
      ...infant,
      id: 'zinc-child',
      ageBand: { minMonthsIncl: 6, maxMonthsExcl: 60 },
      phases: [{ label: 'maintenance', dose: { basis: 'per_day', perKg: false, amount: { value: 20, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' } }],
    }
    const rInfant = calculate(baseInput({ rules: [infant, child], ageMonths: 3, formulation: tab250Scored }))
    const rChild = calculate(baseInput({ rules: [infant, child], ageMonths: 24, formulation: tab250Scored }))
    expect(rInfant.appliedRule?.id).toBe('zinc-infant')
    expect(rChild.appliedRule?.id).toBe('zinc-child')
  })

  it('asks for age (not "fix the data") when an age-band reference gets no age', () => {
    const infant: DosingRule = {
      id: 'zinc-infant',
      referenceId: REF,
      ageBand: { minMonthsIncl: 0, maxMonthsExcl: 6 },
      priority: 100,
      phases: [{ label: 'maintenance', dose: { basis: 'per_day', perKg: false, amount: { value: 10, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' } }],
      provenance: prov(),
    }
    const child: DosingRule = { ...infant, id: 'zinc-child', ageBand: { minMonthsIncl: 6, maxMonthsExcl: 60 } }
    const r = calculate(baseInput({ rules: [infant, child], ageMonths: null, formulation: tab250Scored }))
    expect(r.status).toBe('blocked')
    expect(r.warnings.map((w) => w.code)).toContain('AGE_REQUIRED')
    expect(r.warnings.map((w) => w.code)).not.toContain('AMBIGUOUS_RULE')
  })

  it('raises a loud warning for unverified data', () => {
    const rule = { ...paraRule(), provenance: prov(false) }
    const r = calculate(baseInput({ rules: [rule] }))
    const unv = r.warnings.find((w) => w.code === 'UNVERIFIED_DATA')
    expect(unv?.severity).toBe('danger')
  })

  it('warns on an implausible weight', () => {
    const r = calculate(baseInput({ weightKg: 300 }))
    expect(r.warnings.map((w) => w.code)).toContain('IMPLAUSIBLE_INPUT')
  })

  it('blocks a non-mass dose amount', () => {
    const rule = paraRule()
    rule.phases[0].dose.amount = { value: 5, unit: 'IU' }
    const r = calculate(baseInput({ rules: [rule] }))
    expect(r.status).toBe('blocked')
    expect(r.warnings.map((w) => w.code)).toContain('UNSUPPORTED_UNIT_DIMENSION')
  })

  it('refuses a flat daily total for a non-uniform (multi-phase) regimen', () => {
    const rule = paraRule()
    rule.phases = [
      { label: 'loading', dose: { basis: 'per_dose', perKg: true, amount: { value: 20, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' } },
      { label: 'maintenance', dose: { basis: 'per_dose', perKg: true, amount: { value: 10, unit: 'mg' }, frequencyPerDay: 3, route: 'oral' } },
    ]
    const r = calculate(baseInput({ rules: [rule] }))
    expect(r.targetDose?.perDay).toBeNull()
    expect(r.warnings.map((w) => w.code)).toContain('NON_UNIFORM_SCHEDULE')
  })
})

describe('calculate — dose ranges (STG age-band style)', () => {
  function rangeRule(): DosingRule {
    const rule = paraRule()
    rule.phases[0].dose = { basis: 'per_dose', perKg: false, amount: { value: 120, unit: 'mg' }, amountMax: { value: 250, unit: 'mg' }, frequencyPerDay: 4, route: 'oral' }
    rule.maxDailyDose = undefined
    rule.absoluteCap = undefined
    return rule
  }

  it('carries a low + high bound and a range instruction', () => {
    const r = calculate(baseInput({ rules: [rangeRule()], weightKg: 15, courseDays: 3 }))
    expect(r.status).toBe('ok')
    expect(r.targetDose?.perDose.value).toBe(120)
    expect(r.targetDose?.perDoseHigh?.value).toBe(250)
    expect(r.targetDose?.perDay?.value).toBe(480)
    expect(r.targetDose?.perDayHigh?.value).toBe(1000)
    // 120 mg / 24 mg/mL = 5.0 mL ; 250 mg / 24 = 10.417 -> 10.5 mL
    expect(r.administration?.value).toBe(5)
    expect(r.administration?.valueHigh).toBe(10.5)
    expect(r.administration?.instruction).toMatch(/5.*10\.5 mL/)
  })

  it('dispenses for the UPPER bound so a course is never short', () => {
    const r = calculate(baseInput({ rules: [rangeRule()], weightKg: 15, courseDays: 3 }))
    // upper bound 10.5 mL x 4 x 3 = 126 mL -> 2 x 100 mL bottles
    expect(r.dispensing?.packs).toBe(2)
  })
})
