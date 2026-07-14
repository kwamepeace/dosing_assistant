/** Renders a CalculationResult: blocked state, the dose, admin, dispensing, and
 *  every warning the engine raised. This view invents nothing — it only formats
 *  what calculate() returned. */
import { AlertTriangle, Ban, CheckCircle2, Info, Pill, ShieldAlert, Syringe } from 'lucide-react'
import type { CalculationResult, Warning } from '../engine/types'
import { frequencyLabel, num, severityRank, severityStyles } from './format'

function WarningRow({ w }: { w: Warning }) {
  const s = severityStyles[w.severity]
  const Icon = w.severity === 'danger' ? ShieldAlert : w.severity === 'caution' ? AlertTriangle : Info
  return (
    <li className={`flex gap-2.5 rounded-lg border p-3 ${s.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.label}`} aria-hidden />
      <div>
        <span className={`block text-[0.68rem] font-semibold uppercase tracking-wide ${s.label}`}>{w.code.replace(/_/g, ' ')}</span>
        <span className={`text-sm ${s.text}`}>{w.message}</span>
      </div>
    </li>
  )
}

export function ResultPanel({ result }: { result: CalculationResult }) {
  const sorted = [...result.warnings].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  if (result.status === 'blocked') {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900/60 dark:bg-red-950/40">
        <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
          <Ban className="h-5 w-5 shrink-0" aria-hidden />
          <h2 className="text-base font-semibold">No dose calculated</h2>
        </div>
        <p className="mt-2 text-sm text-red-900 dark:text-red-200">{result.blockedReason}</p>
        {sorted.length > 0 && <ul className="mt-4 space-y-2">{sorted.map((w, i) => <WarningRow key={i} w={w} />)}</ul>}
      </div>
    )
  }

  const { targetDose: t, administration: a, dispensing: d, provenance: p } = result

  return (
    <div className="space-y-4">
      {/* Primary action — what the nurse actually does */}
      {a && (
        <div className="rounded-xl border border-teal-300 bg-teal-50 p-5 dark:border-teal-800 dark:bg-teal-950/40">
          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
            {a.kind === 'volume' ? <Syringe className="h-4 w-4" aria-hidden /> : <Pill className="h-4 w-4" aria-hidden />}
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide">Give each dose</span>
          </div>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight text-teal-900 tabular-nums dark:text-teal-100">{a.instruction}</p>
          {t && <p className="mt-1 text-sm text-teal-800/90 dark:text-teal-200/80">{frequencyLabel(t.frequencyPerDay)}</p>}
          <p className="mt-2 text-xs text-teal-700/80 dark:text-teal-300/70">
            Delivers ≈ {a.deliveredMgHigh != null ? `${num(a.deliveredMg)}–${num(a.deliveredMgHigh)}` : num(a.deliveredMg)} mg per dose
          </p>
        </div>
      )}

      {/* Target dose */}
      {t && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-sm dark:border-slate-700 dark:bg-slate-700">
          <div className="bg-white p-3 dark:bg-slate-900">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Dose</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {t.perDoseHigh ? `${num(t.perDose.value)}–${num(t.perDoseHigh.value)}` : num(t.perDose.value)} {t.perDose.unit}
            </dd>
          </div>
          <div className="bg-white p-3 dark:bg-slate-900">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Per day</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {t.perDay ? `${t.perDayHigh ? `${num(t.perDay.value)}–${num(t.perDayHigh.value)}` : num(t.perDay.value)} ${t.perDay.unit}` : '—'}
            </dd>
          </div>
          <div className="col-span-2 bg-white p-3 dark:bg-slate-900">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Basis</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="tabular-nums">{t.basisLabel}</span>
              {t.capApplied && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.68rem] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  capped to safe limit
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {/* Dispensing */}
      {d && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide">Dispense for {num(d.courseDays)}-day course</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{d.totalLabel}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{d.packLabel}</p>
        </div>
      )}

      {/* Warnings */}
      {sorted.length > 0 && <ul className="space-y-2">{sorted.map((w, i) => <WarningRow key={i} w={w} />)}</ul>}

      {/* Provenance */}
      {p && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
          {p.verified ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          )}
          <span className="text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">{p.verified ? 'Verified' : 'Unverified'}</span> · {p.citation}
          </span>
        </div>
      )}
    </div>
  )
}
