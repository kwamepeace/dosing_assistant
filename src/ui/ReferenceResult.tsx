/** One column of the side-by-side comparison: a reference's header (name,
 *  edition, and a pill saying HOW it doses — by age band vs by weight) above the
 *  ResultPanel for that reference. */
import { Star } from 'lucide-react'
import type { Reference } from '../data/schema'
import type { CalculationResult } from '../engine/types'
import { ResultPanel } from './ResultPanel'

/** Describe the dosing model of the rule the engine actually applied. */
function modelHint(result: CalculationResult): string | null {
  const rule = result.appliedRule
  if (!rule) return null
  if (rule.phases[0]?.dose.perKg) return 'weight-based · mg/kg'
  if (rule.ageBand) return 'by age band'
  return 'fixed dose'
}

export function ReferenceResult({ reference, result }: { reference: Reference; result: CalculationResult | null }) {
  const hint = result ? modelHint(result) : null
  return (
    <section className="flex flex-col">
      <header className="mb-3 flex items-start justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {reference.preferred && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="preferred source" />}
            {reference.shortName}
          </h3>
          <p className="text-xs text-slate-500">{reference.editionLabel}</p>
        </div>
        {hint && (
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {hint}
          </span>
        )}
      </header>
      {result ? (
        <ResultPanel result={result} />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          Enter a weight to calculate.
        </div>
      )}
    </section>
  )
}
