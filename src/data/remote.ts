/**
 * Supabase read path (used when configured; the UI still defaults to the local
 * seed today). Fetches the relational rows, reassembles them into the nested
 * `Drug`/`Reference` shapes, and re-validates with the SAME Zod schema the local
 * loader uses — Postgres is storage, Zod is the gate. Malformed rows throw here,
 * exactly like the local loader, rather than reaching the engine.
 *
 * RLS means a clinician only receives `verified` rules, so a drug with no
 * verified rules yet is skipped (Zod requires >= 1 rule per drug).
 */
import { Drug, Reference, type Formulation, type DosingRule } from './schema'
import { getSupabase } from '../lib/supabase'

interface FormulationRow { id: string; drug_id: string; kind: string; display_name: string; routes: string[]; spec: Record<string, unknown> }
interface RuleRow {
  id: string; drug_id: string; reference_id: string; indication_id: string | null
  min_kg_incl: number | null; max_kg_excl: number | null
  min_months_incl: number | null; max_months_excl: number | null
  priority: number; phases: unknown; max_single_dose: unknown; max_daily_dose: unknown; absolute_cap: unknown
  default_duration_days: number | null; notes: string | null
  prov_reference_id: string; prov_edition_id: string; prov_citation: string
  verified: boolean; verified_by: string | null; verification_note: string
}
interface DrugRow { id: string; name: string; synonyms: string[]; data_status: string }

function toFormulation(r: FormulationRow): Formulation {
  // Kind-specific fields live in `spec`; merge them back onto the base shape.
  return Drug.shape.formulations.element.parse({
    id: r.id,
    displayName: r.display_name,
    routes: r.routes,
    kind: r.kind,
    ...r.spec,
  })
}

function toRule(r: RuleRow): DosingRule {
  const weightBand = r.min_kg_incl != null || r.max_kg_excl != null ? { minKgIncl: r.min_kg_incl, maxKgExcl: r.max_kg_excl } : null
  const ageBand = r.min_months_incl != null || r.max_months_excl != null ? { minMonthsIncl: r.min_months_incl, maxMonthsExcl: r.max_months_excl } : null
  return {
    id: r.id,
    referenceId: r.reference_id,
    indicationId: r.indication_id,
    weightBand,
    ageBand,
    priority: r.priority,
    phases: r.phases as DosingRule['phases'],
    maxSingleDose: r.max_single_dose as DosingRule['maxSingleDose'],
    maxDailyDose: r.max_daily_dose as DosingRule['maxDailyDose'],
    absoluteCap: r.absolute_cap as DosingRule['absoluteCap'],
    defaultDurationDays: r.default_duration_days,
    notes: r.notes,
    provenance: {
      referenceId: r.prov_reference_id,
      editionId: r.prov_edition_id,
      citation: r.prov_citation,
      verified: r.verified,
      verifiedBy: r.verified_by,
      verificationNote: r.verification_note,
    },
  }
}

export interface RemoteData {
  references: Reference[]
  drugs: Drug[]
}

/** Load + validate the served dataset from Supabase, or null if not configured. */
export async function loadRemoteData(): Promise<RemoteData | null> {
  const client = await getSupabase()
  if (!client) return null

  const [refsRes, drugsRes, formsRes, rulesRes] = await Promise.all([
    client.from('refs').select('*'),
    client.from('drugs').select('*'),
    client.from('formulations').select('*'),
    client.from('dosing_rules').select('*'),
  ])
  for (const res of [refsRes, drugsRes, formsRes, rulesRes]) {
    if (res.error) throw new Error(`[remote] ${res.error.message}`)
  }

  const references = (refsRes.data ?? []).map((r) =>
    Reference.parse({
      id: r.id,
      name: r.name,
      shortName: r.short_name,
      editionId: r.edition_id,
      editionLabel: r.edition_label,
      preferred: r.preferred,
      notYetPopulated: r.not_yet_populated,
      licensed: r.licensed,
    }),
  )

  const formsByDrug = new Map<string, Formulation[]>()
  for (const f of (formsRes.data ?? []) as FormulationRow[]) {
    const list = formsByDrug.get(f.drug_id) ?? []
    list.push(toFormulation(f))
    formsByDrug.set(f.drug_id, list)
  }
  const rulesByDrug = new Map<string, DosingRule[]>()
  for (const r of (rulesRes.data ?? []) as RuleRow[]) {
    const list = rulesByDrug.get(r.drug_id) ?? []
    list.push(toRule(r))
    rulesByDrug.set(r.drug_id, list)
  }

  const drugs: Drug[] = []
  for (const d of (drugsRes.data ?? []) as DrugRow[]) {
    const rules = rulesByDrug.get(d.id) ?? []
    if (rules.length === 0) continue // no verified rules visible under RLS — skip
    drugs.push(
      Drug.parse({
        id: d.id,
        name: d.name,
        synonyms: d.synonyms,
        dataStatus: d.data_status,
        formulations: formsByDrug.get(d.id) ?? [],
        rules,
      }),
    )
  }

  return { references, drugs }
}
