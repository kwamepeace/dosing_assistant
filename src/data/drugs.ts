/**
 * SEED DRUG DATA — MOCK, UNVERIFIED.
 * ---------------------------------------------------------------------------
 * Every drug here is `dataStatus: 'mock_for_ui_testing'` and every rule is
 * `provenance.verified: false`. The dose figures are STANDARD paediatric values
 * chosen so the app is demonstrable and the maths is exercisable — they are NOT
 * confirmed against the Ghana STG 2017 book, and the citations say so plainly.
 *
 * This is deliberate: the whole system is built on "no number is trusted until a
 * pharmacist confirms it against the primary source." Marking placeholder data
 * as verified would be the exact failure the design exists to prevent. A
 * pharmacist flips `verified` to true (and fixes the citation to a real page)
 * one rule at a time.
 *
 * Deferred on purpose: artemether-lumefantrine (weight-band, whole-tablet,
 * non-uniform 0/8h schedule, combination product) — it needs the dedicated
 * modelling described in the plan, not a rushed placeholder.
 */
import type { Drug } from './schema'

const REF = 'ghana-stg-2017'
const UNVERIFIED_NOTE = 'PLACEHOLDER dose — standard paediatric value, NOT yet confirmed against Ghana STG 2017. Confirm the figure and record the exact page/section.'

export const paracetamol: Drug = {
  id: 'paracetamol',
  name: 'Paracetamol',
  synonyms: ['Acetaminophen', 'Panadol', 'Calpol'],
  dataStatus: 'mock_for_ui_testing',
  formulations: [
    {
      id: 'para-susp-120',
      displayName: 'Suspension 120 mg/5 mL',
      routes: ['oral'],
      kind: 'liquid',
      strength: { value: 120, unit: 'mg' },
      perVolume: { value: 5, unit: 'mL' },
      containerVolumeMl: 100,
      measurableIncrementMl: 0.5,
    },
    {
      id: 'para-susp-250',
      displayName: 'Suspension 250 mg/5 mL',
      routes: ['oral'],
      kind: 'liquid',
      strength: { value: 250, unit: 'mg' },
      perVolume: { value: 5, unit: 'mL' },
      containerVolumeMl: 100,
      measurableIncrementMl: 0.5,
    },
    {
      id: 'para-tab-500',
      displayName: 'Tablet 500 mg (scored)',
      routes: ['oral'],
      kind: 'solid',
      unit: 'tablet',
      strengthPerUnit: { value: 500, unit: 'mg' },
      scored: true,
      allowedFractions: [1, 0.5],
      packSize: 20,
    },
  ],
  rules: [
    {
      id: 'para-fever-pain',
      referenceId: REF,
      indicationId: null, // general antipyretic/analgesic — matches without an indication
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: {
            basis: 'per_dose',
            perKg: true,
            amount: { value: 15, unit: 'mg' },
            amountMax: { value: 15, unit: 'mg' },
            frequencyPerDay: 4, // every 6 hours
            maxDosesPer24h: 4,
            route: 'oral',
          },
        },
      ],
      maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } },
      absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
      defaultDurationDays: 3,
      provenance: {
        referenceId: REF,
        editionId: '2017',
        citation: 'Ghana STG 2017 — PLACEHOLDER, page not yet confirmed',
        verified: false,
        verificationNote: UNVERIFIED_NOTE,
      },
      notes: 'Usual range 10–15 mg/kg/dose every 4–6 h. Do not exceed 75 mg/kg/day or 4 g/day.',
    },
  ],
}

export const amoxicillin: Drug = {
  id: 'amoxicillin',
  name: 'Amoxicillin',
  synonyms: ['Amoxil'],
  dataStatus: 'mock_for_ui_testing',
  formulations: [
    {
      id: 'amox-susp-125',
      displayName: 'Suspension 125 mg/5 mL (reconstituted)',
      routes: ['oral'],
      kind: 'liquid',
      strength: { value: 125, unit: 'mg' },
      perVolume: { value: 5, unit: 'mL' },
      containerVolumeMl: 100,
      measurableIncrementMl: 0.5,
      reconstitution: {
        diluentMl: 90,
        finalConcentration: { value: 125, unit: 'mg' },
        perVolume: { value: 5, unit: 'mL' },
        stabilityNote: 'Use within 7 days of reconstitution; keep refrigerated where possible.',
      },
    },
    {
      id: 'amox-susp-250',
      displayName: 'Suspension 250 mg/5 mL (reconstituted)',
      routes: ['oral'],
      kind: 'liquid',
      strength: { value: 250, unit: 'mg' },
      perVolume: { value: 5, unit: 'mL' },
      containerVolumeMl: 100,
      measurableIncrementMl: 0.5,
    },
    {
      id: 'amox-cap-250',
      displayName: 'Capsule 250 mg',
      routes: ['oral'],
      kind: 'solid',
      unit: 'capsule',
      strengthPerUnit: { value: 250, unit: 'mg' },
      scored: false,
      allowedFractions: [1], // capsules can't be split
      packSize: 21,
    },
  ],
  rules: [
    {
      id: 'amox-general',
      referenceId: REF,
      indicationId: null,
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: {
            basis: 'per_dose',
            perKg: true,
            amount: { value: 15, unit: 'mg' },
            frequencyPerDay: 3, // every 8 hours
            route: 'oral',
          },
        },
      ],
      maxSingleDose: { kind: 'absolute', amount: { value: 500, unit: 'mg' } },
      absoluteCap: { kind: 'absolute', amount: { value: 1500, unit: 'mg' } },
      defaultDurationDays: 5,
      provenance: {
        referenceId: REF,
        editionId: '2017',
        citation: 'Ghana STG 2017 — PLACEHOLDER, page not yet confirmed',
        verified: false,
        verificationNote: UNVERIFIED_NOTE,
      },
      notes: 'Placeholder 15 mg/kg/dose q8h (~45 mg/kg/day). Higher doses are used for some indications (e.g. pneumonia) — confirm per STG.',
    },
  ],
}

export const zincSulfate: Drug = {
  id: 'zinc-sulfate',
  name: 'Zinc sulfate',
  synonyms: ['Zinc'],
  dataStatus: 'mock_for_ui_testing',
  formulations: [
    {
      id: 'zinc-disp-20',
      displayName: 'Dispersible tablet 20 mg',
      routes: ['oral'],
      kind: 'solid',
      unit: 'tablet',
      strengthPerUnit: { value: 20, unit: 'mg' },
      scored: true,
      allowedFractions: [1, 0.5],
      packSize: 10,
    },
  ],
  rules: [
    {
      id: 'zinc-diarrhoea-infant',
      referenceId: REF,
      indicationId: null,
      ageBand: { minMonthsIncl: 0, maxMonthsExcl: 6 },
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_day', perKg: false, amount: { value: 10, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' },
        },
      ],
      defaultDurationDays: 14,
      provenance: {
        referenceId: REF,
        editionId: '2017',
        citation: 'Ghana STG 2017 — PLACEHOLDER, page not yet confirmed',
        verified: false,
        verificationNote: UNVERIFIED_NOTE,
      },
      notes: 'Infants < 6 months: 10 mg (½ dispersible tablet) once daily for 10–14 days alongside ORS.',
    },
    {
      id: 'zinc-diarrhoea-child',
      referenceId: REF,
      indicationId: null,
      ageBand: { minMonthsIncl: 6, maxMonthsExcl: 60 },
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_day', perKg: false, amount: { value: 20, unit: 'mg' }, frequencyPerDay: 1, route: 'oral' },
        },
      ],
      defaultDurationDays: 14,
      provenance: {
        referenceId: REF,
        editionId: '2017',
        citation: 'Ghana STG 2017 — PLACEHOLDER, page not yet confirmed',
        verified: false,
        verificationNote: UNVERIFIED_NOTE,
      },
      notes: 'Children ≥ 6 months: 20 mg (1 dispersible tablet) once daily for 10–14 days alongside ORS.',
    },
  ],
}

export const seedDrugs: Drug[] = [paracetamol, amoxicillin, zincSulfate]
