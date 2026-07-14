/** Renders a CalculationResult: blocked state, the dose, admin, dispensing, and
 *  the warnings worth surfacing. Plain and classic — the dose leads, everything
 *  else is quiet. The blanket "unverified" flag is folded into the small source
 *  line rather than repeated as a loud row. */
import { AlertTriangle, Ban, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import type { CalculationResult, Warning } from '../engine/types'
import { frequencyLabel, num, severityRank, severityStyles } from './format'

function WarningRow({ w }: { w: Warning }) {
  const s = severityStyles[w.severity]
  const Icon = w.severity === 'danger' ? ShieldAlert : w.severity === 'caution' ? AlertTriangle : Info
  return (
    <li className={`flex gap-2.5 rounded-md border p-3 ${s.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.label}`} aria-hidden />
      <span className={`text-sm ${s.text}`}>{w.message}</span>
    </li>
  )
}

export function ResultPanel({ result }: { result: CalculationResult }) {
  const shown = result.warnings
    .filter((w) => w.code !== 'UNVERIFIED_DATA')
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  if (result.status === 'blocked') {
    return (
      <div className="rounded-md border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Ban className="h-4 w-4 shrink-0" aria-hidden />
          <h3 className="text-sm font-medium">No dose yet</h3>
        </div>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{result.blockedReason}</p>
      </div>
    )
  }

  const { targetDose: t, administration: a, dispensing: d, provenance: p, appliedRule } = result

  return (
    <div className="space-y-4">
      {/* Primary action — what the nurse actually does */}
      {a && (
        <div className="border-l-2 border-slate-900 pl-4 dark:border-slate-100">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">Give each dose</p>
          <p className="mt-1 font-serif text-3xl tracking-tight text-slate-900 tabular-nums dark:text-slate-50">{a.instruction}</p>
          {t && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{frequencyLabel(t.frequencyPerDay)}</p>}
          <p className="mt-1 text-xs text-slate-400">
            ≈ {a.deliveredMgHigh != null ? `${num(a.deliveredMg)}–${num(a.deliveredMgHigh)}` : num(a.deliveredMg)} mg per dose
          </p>
        </div>
      )}

      {/* Target dose + dispensing — a plain two-column definition list */}
      <dl className="grid grid-cols-2 border-y border-slate-200 text-sm dark:border-slate-800">
        {t && (
          <div className="border-r border-slate-200 py-3 pr-4 dark:border-slate-800">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Dose</dt>
            <dd className="mt-1 font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {t.perDoseHigh ? `${num(t.perDose.value)}–${num(t.perDoseHigh.value)}` : num(t.perDose.value)} {t.perDose.unit}
              {t.capApplied && <span className="ml-1.5 align-middle text-[0.62rem] font-semibold uppercase text-slate-500">· capped</span>}
            </dd>
            <dd className="mt-0.5 text-xs text-slate-500">{t.basisLabel}</dd>
          </div>
        )}
        {d && (
          <div className="py-3 pl-4">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">Dispense · {num(d.courseDays)} days</dt>
            <dd className="mt-1 font-medium tabular-nums text-slate-900 dark:text-slate-100">{d.totalLabel}</dd>
            <dd className="mt-0.5 text-xs text-slate-500">{d.packLabel}</dd>
          </div>
        )}
      </dl>

      {/* Rule note — clinical context, not a disclaimer */}
      {appliedRule?.notes && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{appliedRule.notes}</p>}

      {/* Real clinical warnings */}
      {shown.length > 0 && <ul className="space-y-2">{shown.map((w, i) => <WarningRow key={i} w={w} />)}</ul>}

      {/* Source line (also carries the verified/unverified state, quietly) */}
      {p && (
        <div className="flex items-start gap-1.5 text-[0.7rem] leading-relaxed text-slate-400">
          {p.verified ? (
            <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-label="unverified" />
          )}
          <span>
            {!p.verified && <span className="font-medium text-slate-500">Awaiting sign-off · </span>}
            {p.citation}
          </span>
        </div>
      )}
    </div>
  )
}
