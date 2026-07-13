/** Small presentation helpers shared by the result views. */
import type { WarningSeverity } from '../engine/types'

/** "4 times a day (every 6 hours)" — collapses cleanly when it doesn't divide. */
export function frequencyLabel(perDay: number): string {
  const times = `${perDay} time${perDay === 1 ? '' : 's'} a day`
  if (perDay <= 0) return times
  const hours = 24 / perDay
  return Number.isInteger(hours) ? `${times} (every ${hours} hours)` : times
}

/** Trim trailing zeros for display: 6.50 -> "6.5", 4.0 -> "4". */
export function num(n: number): string {
  return Number(n.toFixed(3)).toString()
}

export const severityRank: Record<WarningSeverity, number> = { danger: 0, caution: 1, info: 2 }

/** Tailwind classes per severity — kept in one place so the palette is consistent. */
export const severityStyles: Record<WarningSeverity, { box: string; label: string; text: string }> = {
  danger: {
    box: 'border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40',
    label: 'text-red-700 dark:text-red-300',
    text: 'text-red-900 dark:text-red-200',
  },
  caution: {
    box: 'border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40',
    label: 'text-amber-700 dark:text-amber-300',
    text: 'text-amber-900 dark:text-amber-200',
  },
  info: {
    box: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60',
    label: 'text-slate-600 dark:text-slate-400',
    text: 'text-slate-700 dark:text-slate-300',
  },
}
