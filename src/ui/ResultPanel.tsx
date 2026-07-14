/** Renders a CalculationResult: blocked state, the dose, admin, dispensing, and
 *  the warnings worth surfacing. This view invents nothing — it only formats what
 *  calculate() returned. The blanket "unverified data" warning is folded into the
 *  small source line at the bottom rather than repeated as a loud row. */
import { AlertTriangle, Ban, CheckCircle2, Info, Pill, ShieldAlert, Syringe } from 'lucide-react'
import type { CalculationResult, Warning } from '../engine/types'
import { frequencyLabel, num, severityRank, severityStyles } from './format'

function WarningRow({ w }: { w: Warning }) {
  const s = severityStyles[w.severity]
  const Icon = w.severity === 'danger' ? ShieldAlert : w.severity === 'caution' ? AlertTriangle : Info
  return (
    <li className={`flex gap-2.5 rounded-lg border p-3 ${s.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.label}`} aria-hidden />
      <span className={`text-sm ${s.text}`}>{w.message}</span>
    </li>
  )
}

export function ResultPanel({ result }: { result: CalculationResult }) {
  // Fold the blanket "unverified" flag into the source line; keep real clinical
  // warnings (caps, splits, unmeasurable doses) as rows.
  const shown = result.warnings
    .filter((w) => w.code !== 'UNVERIFIED_DATA')
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  if (result.status === 'blocked') {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <Ban className="h-5 w-5 shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold">No dose yet</h2>
        </div>
        <p className="mt-2 text-sm text-amber-900 dark:text-amber-200/90">{result.blockedReason}</p>
      </div>
    )
  }

  const { targetDose: t, administration: a, dispensing: d, provenance: p, appliedRule } = result

  return (
    <div className="space-y-3">
      {/* Primary action — what the nurse actually does */}
      {a && (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-5 shadow-sm dark:border-teal-900/60 dark:from-teal-950/40 dark:to-slate-900">
          <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
            {a.kind === 'volume' ? <Syringe className="h-4 w-4" aria-hidden /> : <Pill className="h-4 w-4" aria-hidden />}
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide">Give each dose</span>
          </div>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight text-teal-900 tabular-nums dark:text-teal-50">{a.instruction}</p>
          {t && <p className="mt-1 text-sm text-teal-800/90 dark:text-teal-200/80">{frequencyLabel(t.frequencyPerDay)}</p>}
          <p className="mt-2 text-xs text-teal-700/70 dark:text-teal-300/60">
            ≈ {a.deliveredMgHigh != null ? `${num(a.deliveredMg)}–${num(a.deliveredMgHigh)}` : num(a.deliveredMg)} mg per dose
          </p>
        </div>
      )}

      {/* Target dose + dispensing, compact */}
      <div className="grid grid-cols-2 gap-2">
        {t && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Dose</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {t.perDoseHigh ? `${num(t.perDose.value)}–${num(t.perDoseHigh.value)}` : num(t.perDose.value)} {t.perDose.unit}
              {t.capApplied && <span className="ml-1.5 align-middle text-[0.62rem] font-semibold text-amber-600 dark:text-amber-400">· capped</span>}
            </dd>
            <dd className="mt-0.5 text-xs text-slate-500">{t.basisLabel}</dd>
          </div>
        )}
        {d ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Dispense · {num(d.courseDays)} days</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">{d.totalLabel}</dd>
            <dd className="mt-0.5 text-xs text-slate-500">{d.packLabel}</dd>
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Rule note — clinical context, not a disclaimer */}
      {appliedRule?.notes && <p className="px-0.5 text-xs text-slate-500 dark:text-slate-400">{appliedRule.notes}</p>}

      {/* Real clinical warnings */}
      {shown.length > 0 && <ul className="space-y-2">{shown.map((w, i) => <WarningRow key={i} w={w} />)}</ul>}

      {/* Source line (also carries the verified/unverified state, quietly) */}
      {p && (
        <div className="flex items-start gap-1.5 border-t border-slate-100 pt-2.5 text-[0.7rem] leading-relaxed text-slate-400 dark:border-slate-800">
          {p.verified ? (
            <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
          ) : (
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="unverified" />
          )}
          <span>
            {!p.verified && <span className="font-medium text-slate-500 dark:text-slate-400">Awaiting sign-off · </span>}
            {p.citation}
          </span>
        </div>
      )}
    </div>
  )
}
