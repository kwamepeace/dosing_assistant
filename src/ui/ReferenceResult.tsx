/** One column of the side-by-side comparison: a reference's header (name,
 *  edition, and how it doses — by age band vs by weight) above the ResultPanel.
 *  Plain and classic: a serif name, a hairline rule, no pills. */
import type { Reference } from '../data/schema'
import type { CalculationResult } from '../engine/types'
import { ResultPanel } from './ResultPanel'

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
      <header className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg text-slate-900 dark:text-slate-100">
            {reference.shortName}
            {reference.preferred && <span className="ml-1.5 align-super text-[0.6rem] font-sans uppercase tracking-wide text-slate-400">preferred</span>}
          </h3>
          {hint && <span className="whitespace-nowrap text-[0.7rem] text-slate-400">{hint}</span>}
        </div>
        <p className="text-xs text-slate-500">{reference.editionLabel}</p>
      </header>
      {result ? (
        <ResultPanel result={result} />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
          Enter a weight to calculate.
        </div>
      )}
    </section>
  )
}
