/**
 * Paediatric Dosing & Dispensing Calculator — v1 UI.
 *
 * A thin, honest shell over the deterministic engine: it collects inputs, calls
 * calculate() once, and renders the result. It states no dose the engine didn't
 * produce, and it never hides that the current dataset is unverified mock data.
 */
import { useMemo, useState } from 'react'
import { FlaskConical, Scale, Baby, BookOpen, Stethoscope } from 'lucide-react'
import { drugById, drugs, references } from './data'
import type { Formulation } from './data/schema'
import { calculate } from './engine/calculate'
import type { CalcInput } from './engine/types'
import { ResultPanel } from './ui/ResultPanel'

const labelCls = 'block text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 mb-1.5'
const fieldCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition ' +
  'focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

function formulationLabel(f: Formulation): string {
  return f.displayName
}

export default function App() {
  const [drugId, setDrugId] = useState(drugs[0].id)
  const [referenceId, setReferenceId] = useState('ghana-stg-2017')
  const [formulationId, setFormulationId] = useState(drugs[0].formulations[0].id)
  const [weight, setWeight] = useState('')
  const [ageMonths, setAgeMonths] = useState('')
  const [courseDays, setCourseDays] = useState('')

  const drug = drugById.get(drugId)!
  const formulation = drug.formulations.find((f) => f.id === formulationId) ?? drug.formulations[0]

  function onDrugChange(id: string) {
    setDrugId(id)
    const next = drugById.get(id)!
    setFormulationId(next.formulations[0].id) // keep formulation valid for the new drug
  }

  const weightKg = parseFloat(weight)
  const hasWeight = Number.isFinite(weightKg) && weightKg > 0

  const result = useMemo(() => {
    if (!hasWeight) return null
    const input: CalcInput = {
      rules: drug.rules,
      referenceId,
      weightKg,
      ageMonths: ageMonths.trim() === '' ? null : parseFloat(ageMonths),
      indicationId: null,
      formulation,
      courseDays: courseDays.trim() === '' ? null : parseFloat(courseDays),
    }
    return calculate(input)
  }, [hasWeight, drug, referenceId, weightKg, ageMonths, formulation, courseDays])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Dev-data banner — every rule shipped today is unverified mock data */}
      <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
        Development build · dosing data is unverified placeholder data · not for clinical use
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
            <Stethoscope className="h-5 w-5" aria-hidden />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]">Paediatric dosing · Ghana</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Dose &amp; dispensing calculator</h1>
          <p className="mt-1.5 max-w-prose text-sm text-slate-600 dark:text-slate-400">
            Enter a child’s weight, choose the drug and formulation, and get the administration dose and the quantity to
            dispense — with every number tied to a cited source.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* ---- Inputs ---- */}
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div>
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

            <div>
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

            <div>
              <label htmlFor="reference" className={labelCls}>
                <BookOpen className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Reference source
              </label>
              <select id="reference" className={fieldCls} value={referenceId} onChange={(e) => setReferenceId(e.target.value)}>
                {references.map((r) => {
                  const disabled = r.notYetPopulated || r.licensed
                  const suffix = r.licensed ? ' — licence required' : r.notYetPopulated ? ' — coming soon' : ''
                  return (
                    <option key={r.id} value={r.id} disabled={disabled}>
                      {r.shortName} ({r.editionLabel}){suffix}
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                  <Baby className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Age (months)
                </label>
                <input
                  id="age"
                  className={fieldCls}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="optional"
                  value={ageMonths}
                  onChange={(e) => setAgeMonths(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="course" className={labelCls}>
                Course length (days)
              </label>
              <input
                id="course"
                className={fieldCls}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="uses the rule default"
                value={courseDays}
                onChange={(e) => setCourseDays(e.target.value)}
              />
            </div>

            <p className="text-xs text-slate-500">
              Age is only needed for age-banded drugs (e.g. zinc for diarrhoea). Course length defaults to the rule’s
              recommended duration when left blank.
            </p>
          </form>

          {/* ---- Result ---- */}
          <div>
            {result ? (
              <ResultPanel result={result} />
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                Enter a weight to calculate the dose.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
