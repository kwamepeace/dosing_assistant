/**
 * Paediatric Dosing & Dispensing Calculator — v1 UI.
 *
 * A thin, honest shell over the deterministic engine. It collects one set of
 * inputs and shows the result for EVERY populated reference side by side, so a
 * clinician can see, at a glance, how the Ghana STG (age-band) and the WHO
 * Pocket Book (weight-based mg/kg) dose the same child differently. It states no
 * dose the engine didn't produce, and never hides that the data is unverified.
 */
import { useMemo, useState } from 'react'
import { FlaskConical, Scale, Baby, Stethoscope, Columns2, Loader2 } from 'lucide-react'
import { drugById, drugs, populatedReferences, references, rulesFor } from './data'
import type { Formulation } from './data/schema'
import { calculate } from './engine/calculate'
import type { CalculationResult } from './engine/types'
import { ReferenceResult } from './ui/ReferenceResult'
import { useAuth } from './auth/AuthProvider'
import { AuthScreen } from './auth/AuthScreen'
import { AccountMenu } from './auth/AccountMenu'

const labelCls = 'block text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mb-1.5'
const fieldCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition ' +
  'focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

function formulationLabel(f: Formulation): string {
  return f.displayName
}

/** Auth shell: gate the calculator behind professional sign-in when Supabase is
 *  configured; otherwise run open (local dev mode). */
export default function App() {
  const { configured, loading, session } = useAuth()
  if (configured && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-label="Loading" />
      </div>
    )
  }
  if (configured && !session) return <AuthScreen />
  return <Calculator />
}

function Calculator() {
  const [drugId, setDrugId] = useState(drugs[0].id)
  const [formulationId, setFormulationId] = useState(drugs[0].formulations[0].id)
  const [weight, setWeight] = useState('')
  const [ageMonths, setAgeMonths] = useState('')
  const [courseDays, setCourseDays] = useState('')

  const drug = drugById.get(drugId)!
  const formulation = drug.formulations.find((f) => f.id === formulationId) ?? drug.formulations[0]

  function onDrugChange(id: string) {
    setDrugId(id)
    setFormulationId(drugById.get(id)!.formulations[0].id) // keep formulation valid for the new drug
  }

  // References that actually have rules for THIS drug, preferred source first.
  const activeRefs = useMemo(
    () =>
      populatedReferences()
        .filter((r) => rulesFor(drugId, r.id).length > 0)
        .sort((a, b) => Number(b.preferred) - Number(a.preferred)),
    [drugId],
  )

  const weightKg = parseFloat(weight)
  const hasWeight = Number.isFinite(weightKg) && weightKg > 0

  // One CalculationResult per active reference — same inputs, different source.
  const results = useMemo(() => {
    if (!hasWeight) return {} as Record<string, CalculationResult>
    const out: Record<string, CalculationResult> = {}
    for (const ref of activeRefs) {
      out[ref.id] = calculate({
        rules: drug.rules,
        referenceId: ref.id,
        weightKg,
        ageMonths: ageMonths.trim() === '' ? null : parseFloat(ageMonths),
        indicationId: null,
        formulation,
        courseDays: courseDays.trim() === '' ? null : parseFloat(courseDays),
      })
    }
    return out
  }, [hasWeight, activeRefs, drug, weightKg, ageMonths, formulation, courseDays])

  const hiddenRefs = references.filter((r) => r.notYetPopulated || r.licensed)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* One quiet line — the data is still being validated */}
      <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-500/90">
        Reference data is still being validated — not yet for clinical use
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
              <Stethoscope className="h-5 w-5" aria-hidden />
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]">Paediatric dosing · Ghana</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Dose &amp; dispensing calculator</h1>
            <p className="mt-1.5 max-w-prose text-sm text-slate-600 dark:text-slate-400">
              Enter a child’s weight, choose the drug and formulation, and compare how each reference doses it — the
              administration dose and the quantity to dispense, every number tied to a cited source.
            </p>
          </div>
          <AccountMenu />
        </header>

        {/* ---- Inputs ---- */}
        <form
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 sm:p-5"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="sm:col-span-2">
            <label htmlFor="drug" className={labelCls}>
              <FlaskConical className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Drug
            </label>
            <select id="drug" className={fieldCls} value={drugId} onChange={(e) => onDrugChange(e.target.value)}>
              {drugs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.synonyms[0] ? ` (${d.synonyms[0]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="formulation" className={labelCls}>
              Formulation / strength
            </label>
            <select id="formulation" className={fieldCls} value={formulation.id} onChange={(e) => setFormulationId(e.target.value)}>
              {drug.formulations.map((f) => (
                <option key={f.id} value={f.id}>
                  {formulationLabel(f)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <div>
              <label htmlFor="weight" className={labelCls}>
                <Scale className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Weight (kg)
              </label>
              <input
                id="weight"
                className={fieldCls}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                placeholder="e.g. 12"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="age" className={labelCls}>
                <Baby className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Age (mo)
              </label>
              <input
                id="age"
                className={fieldCls}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="if age-band"
                value={ageMonths}
                onChange={(e) => setAgeMonths(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="course" className={labelCls}>
                Course (days)
              </label>
              <input
                id="course"
                className={fieldCls}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="default"
                value={courseDays}
                onChange={(e) => setCourseDays(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 sm:col-span-2">
            Age is needed for age-banded references (e.g. the Ghana STG for paracetamol, amoxicillin, zinc). Course length
            defaults to each rule’s recommended duration when left blank.
          </p>
        </form>

        {/* ---- Comparison ---- */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-slate-500">
            <Columns2 className="h-4 w-4" aria-hidden />
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide">
              {activeRefs.length > 1 ? `Comparison · ${activeRefs.length} references` : 'Result'}
            </h2>
          </div>

          <div className={`grid gap-6 ${activeRefs.length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {activeRefs.map((ref) => (
              <ReferenceResult key={ref.id} reference={ref} result={hasWeight ? results[ref.id] : null} />
            ))}
          </div>

          {hiddenRefs.length > 0 && (
            <p className="mt-5 text-xs text-slate-400">
              Not shown:{' '}
              {hiddenRefs.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ', '}
                  {r.shortName} ({r.licensed ? 'licence required' : 'coming soon'})
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
