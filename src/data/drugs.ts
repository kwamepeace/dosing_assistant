/**
 * SEED DRUG DATA.
 * ---------------------------------------------------------------------------
 * Every rule here is still `provenance.verified: false` — it awaits a
 * pharmacist's countersign before it can be trusted clinically. But the figures
 * and citations are now REAL, not placeholders:
 *
 *  - Ghana STG rules are transcribed from the actual Ghana STG 2017 book, with
 *    exact chapter/section/page citations. The STG doses these drugs by AGE BAND
 *    (fixed mg, sometimes a range), not by weight.
 *  - WHO rules are the weight-based (mg/kg) cross-check. Their figures are
 *    standard paediatric values; the exact WHO Pocket Book page is still to be
 *    confirmed (noted in each verificationNote).
 *
 * The design invariant holds: no number is trusted until a human clinician
 * confirms it and flips `verified` to true. Any interpretation made during
 * transcription (age-band boundaries, frequency ranges, a safety cap added on
 * top of an STG age-band dose) is spelled out in the verificationNote so the
 * countersign is a review, not a leap of faith.
 *
 * Deferred on purpose: artemether-lumefantrine (weight-band, whole-tablet,
 * non-uniform 0/8h schedule, combination product) — needs dedicated modelling.
 */
import type { Drug } from './schema'

const STG = 'ghana-stg-2017'
const WHO = 'who-pocketbook-2013'

// Age-band boundaries in MONTHS. The STG writes bands like "1-5 years" and
// "6-12 years", which leave gaps (age 5-6) and open questions at the edges.
// These half-open [min, max) bounds close the gaps with the standard reading
// ("1-5 years" = 1 year up to the 6th birthday). Documented per rule.
const MO = { y1: 12, y5: 72, y6: 72, y12: 156, y18: 216 }

const PARA_STG_CITE =
  'Ghana STG, 7th ed. (2017), Ch.4 Haematological Disorders, §18 Sickle Cell Disease, "A. Vaso-occlusive bone pain crises → Mild to moderate pain" (Paracetamol, oral), printed pp.70–71.'
const PARA_STG_NOTE =
  'Transcribed from Ghana STG 2017 pp.70–71 (age-band mg ranges, 6–8 hourly). INTERPRETATIONS for countersign: (1) modelled as q6h (frequencyPerDay 4) though STG says "6–8 hourly"; (2) a universal paracetamol safety ceiling (75 mg/kg/day and 4 g/day) is added on top of the STG age-band dose — it can only reduce, never raise, the dose; (3) age-band edges are half-open, closing the STG 5–6 yr gap. This table sits under Sickle Cell pain; confirm it is the intended general paracetamol reference.'
const AMOX_STG_CITE =
  'Ghana STG, 7th ed. (2017), Ch.5 Immunisable Diseases, §28 Diphtheria (Amoxicillin, oral), printed p.92.'
const AMOX_STG_NOTE =
  'Transcribed from Ghana STG 2017 p.92: age-band amoxicillin 125/250/500 mg, 12 hourly. INTERPRETATIONS for countersign: (1) this table is in the Diphtheria section and states a 10-day course; a general 5-day default is used here — confirm duration per indication and relocate the citation to a more general amoxicillin reference if preferred; (2) age-band edges are half-open.'
const WHO_NOTE =
  'Weight-based (mg/kg) cross-check. Figure is a standard paediatric value; the exact WHO Pocket Book of Hospital Care for Children (2nd ed., 2013) page is NOT yet confirmed. Confirm the figure and record the page before countersigning.'

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
    // --- Ghana STG: age-band, fixed-mg ranges, 6–8 hourly (modelled q6h) ----
    {
      id: 'para-stg-3mo-1yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: 3, maxMonthsExcl: MO.y1 },
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_dose', perKg: false, amount: { value: 60, unit: 'mg' }, amountMax: { value: 120, unit: 'mg' }, frequencyPerDay: 4, maxDosesPer24h: 4, route: 'oral' },
        },
      ],
      maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } }, // universal safety ceiling (see note)
      absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
      defaultDurationDays: 3,
      provenance: { referenceId: STG, editionId: '2017', citation: PARA_STG_CITE, verified: false, verifiedBy: null, verificationNote: PARA_STG_NOTE },
      notes: '3 months–1 year: 60–120 mg every 6–8 hours (STG).',
    },
    {
      id: 'para-stg-1-5yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: MO.y1, maxMonthsExcl: MO.y5 },
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_dose', perKg: false, amount: { value: 120, unit: 'mg' }, amountMax: { value: 250, unit: 'mg' }, frequencyPerDay: 4, maxDosesPer24h: 4, route: 'oral' },
        },
      ],
      maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } },
      absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
      defaultDurationDays: 3,
      provenance: { referenceId: STG, editionId: '2017', citation: PARA_STG_CITE, verified: false, verifiedBy: null, verificationNote: PARA_STG_NOTE },
      notes: '1–5 years: 120–250 mg every 6–8 hours (STG). Band modelled as 1 yr up to the 6th birthday.',
    },
    {
      id: 'para-stg-6-12yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: MO.y6, maxMonthsExcl: MO.y12 },
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_dose', perKg: false, amount: { value: 250, unit: 'mg' }, amountMax: { value: 500, unit: 'mg' }, frequencyPerDay: 4, maxDosesPer24h: 4, route: 'oral' },
        },
      ],
      maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } },
      absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
      defaultDurationDays: 3,
      provenance: { referenceId: STG, editionId: '2017', citation: PARA_STG_CITE, verified: false, verifiedBy: null, verificationNote: PARA_STG_NOTE },
      notes: '6–12 years: 250–500 mg every 6–8 hours (STG).',
    },
    // --- WHO: weight-based cross-check --------------------------------------
    {
      id: 'para-who-weight',
      referenceId: WHO,
      indicationId: null,
      priority: 100,
      phases: [
        {
          label: 'maintenance',
          dose: { basis: 'per_dose', perKg: true, amount: { value: 15, unit: 'mg' }, frequencyPerDay: 4, maxDosesPer24h: 4, route: 'oral' },
        },
      ],
      maxDailyDose: { kind: 'per_kg', amountPerKg: { value: 75, unit: 'mg' } },
      absoluteCap: { kind: 'absolute', amount: { value: 4000, unit: 'mg' } },
      defaultDurationDays: 3,
      provenance: { referenceId: WHO, editionId: '2013', citation: 'WHO Pocket Book of Hospital Care for Children, 2nd ed. (2013) — paracetamol 15 mg/kg/dose (page to confirm).', verified: false, verifiedBy: null, verificationNote: WHO_NOTE },
      notes: '15 mg/kg/dose every 6 hours; max 75 mg/kg/day and 4 g/day. Weight-based cross-check to the STG age bands.',
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
    // --- Ghana STG: age-band, fixed mg, 12 hourly --------------------------
    {
      id: 'amox-stg-1mo-1yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: 1, maxMonthsExcl: MO.y1 },
      priority: 100,
      phases: [
        { label: 'maintenance', dose: { basis: 'per_dose', perKg: false, amount: { value: 125, unit: 'mg' }, frequencyPerDay: 2, route: 'oral' } },
      ],
      defaultDurationDays: 5,
      provenance: { referenceId: STG, editionId: '2017', citation: AMOX_STG_CITE, verified: false, verifiedBy: null, verificationNote: AMOX_STG_NOTE },
      notes: '1 month–1 year: 125 mg 12 hourly (STG).',
    },
    {
      id: 'amox-stg-1-5yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: MO.y1, maxMonthsExcl: MO.y5 },
      priority: 100,
      phases: [
        { label: 'maintenance', dose: { basis: 'per_dose', perKg: false, amount: { value: 250, unit: 'mg' }, frequencyPerDay: 2, route: 'oral' } },
      ],
      defaultDurationDays: 5,
      provenance: { referenceId: STG, editionId: '2017', citation: AMOX_STG_CITE, verified: false, verifiedBy: null, verificationNote: AMOX_STG_NOTE },
      notes: '1–5 years: 250 mg 12 hourly (STG). Band modelled as 1 yr up to the 6th birthday.',
    },
    {
      id: 'amox-stg-5-18yr',
      referenceId: STG,
      indicationId: null,
      ageBand: { minMonthsIncl: MO.y6, maxMonthsExcl: MO.y18 },
      priority: 100,
      phases: [
        { label: 'maintenance', dose: { basis: 'per_dose', perKg: false, amount: { value: 500, unit: 'mg' }, frequencyPerDay: 2, route: 'oral' } },
      ],
      defaultDurationDays: 5,
      provenance: { referenceId: STG, editionId: '2017', citation: AMOX_STG_CITE, verified: false, verifiedBy: null, verificationNote: AMOX_STG_NOTE },
      notes: '5–18 years: 500 mg 12 hourly (STG).',
    },
    // --- WHO: weight-based cross-check -------------------------------------
    {
      id: 'amox-who-weight',
      referenceId: WHO,
      indicationId: null,
      priority: 100,
      phases: [
        { label: 'maintenance', dose: { basis: 'per_dose', perKg: true, amount: { value: 15, unit: 'mg' }, frequencyPerDay: 3, route: 'oral' } },
      ],
      maxSingleDose: { kind: 'absolute', amount: { value: 500, unit: 'mg' } },
      defaultDurationDays: 5,
      provenance: { referenceId: WHO, editionId: '2013', citation: 'WHO Pocket Book of Hospital Care for Children, 2nd ed. (2013) — amoxicillin ~15 mg/kg/dose (page to confirm; higher doses used for pneumonia).', verified: false, verifiedBy: null, verificationNote: WHO_NOTE + ' NOTE: WHO uses higher amoxicillin doses for pneumonia (up to ~40 mg/kg/dose); this rule is a conservative general value.' },
      notes: '15 mg/kg/dose every 8 hours (~45 mg/kg/day). Weight-based cross-check; WHO uses higher doses for pneumonia — confirm per indication.',
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
      referenceId: STG,
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
        referenceId: STG,
        editionId: '2017',
        citation:
          'Ghana STG, 7th ed. (2017), Ch.1 Disorders of the Gastrointestinal Tract, §8 Diarrhoea, "D. Zinc supplementation for diarrhoea" (Evidence Rating A), printed p.15.',
        verified: false,
        verifiedBy: null,
        verificationNote:
          'Transcribed from Ghana STG 2017 p.15: "Children < 6 months; 10 mg/day for 10-14 days." Figures match this rule. Awaiting clinician countersign to set verified: true.',
      },
      notes:
        'Infants < 6 months: 10 mg (½ of a 20 mg dispersible tablet) once daily for 10–14 days, alongside ORS. STG doses zinc by age band, not mg/kg.',
    },
    {
      id: 'zinc-diarrhoea-child',
      referenceId: STG,
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
        referenceId: STG,
        editionId: '2017',
        citation:
          'Ghana STG, 7th ed. (2017), Ch.1 Disorders of the Gastrointestinal Tract, §8 Diarrhoea, "D. Zinc supplementation for diarrhoea" (Evidence Rating A), printed p.15.',
        verified: false,
        verifiedBy: null,
        verificationNote:
          'Transcribed from Ghana STG 2017 p.15: "Children > 6 months; 20 mg/day for 10-14 days." NOTE: STG writes ">6 / <6 months"; this rule assigns exactly 6.0 months to the 20 mg band (standard reading). Awaiting clinician countersign.',
      },
      notes:
        'Children ≥ 6 months: 20 mg (1 × 20 mg dispersible tablet) once daily for 10–14 days, alongside ORS. STG doses zinc by age band, not mg/kg.',
    },
  ],
}

export const seedDrugs: Drug[] = [paracetamol, amoxicillin, zincSulfate]
