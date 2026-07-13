/**
 * Deterministic rule selection.
 *
 *  1. Filter the drug's rules to the chosen reference.
 *  2. Keep those whose weight band [minIncl, maxExcl) contains the weight,
 *     whose age band (if any) contains the age, and whose indication (if any)
 *     matches the chosen indication.
 *  3. Among survivors, the lowest `priority` wins.
 *  4. If two survivors share the lowest priority => AMBIGUOUS (a hard block,
 *     never a silent "first wins"). If none match => NO_RULE_MATCH.
 *
 * Half-open bands make boundary double-matches structurally impossible; the
 * explicit priority makes selection deterministic and authorable.
 */
import type { DosingRule } from '../data/schema'

export type RuleSelection =
  | { ok: true; rule: DosingRule }
  | { ok: false; reason: 'NO_RULE_MATCH' | 'AMBIGUOUS_RULE'; detail: string }

export interface SelectionCtx {
  referenceId: string
  weightKg: number
  ageMonths?: number | null
  indicationId?: string | null
}

function weightInBand(rule: DosingRule, kg: number): boolean {
  if (!rule.weightBand) return true
  const { minKgIncl, maxKgExcl } = rule.weightBand
  if (minKgIncl != null && kg < minKgIncl) return false
  if (maxKgExcl != null && kg >= maxKgExcl) return false // EXCLUSIVE upper bound
  return true
}

function ageInBand(rule: DosingRule, months: number | null | undefined): boolean {
  if (!rule.ageBand) return true
  const { minMonthsIncl, maxMonthsExcl } = rule.ageBand
  if (months == null) return true // age is optional; absent age does not exclude
  if (minMonthsIncl != null && months < minMonthsIncl) return false
  if (maxMonthsExcl != null && months >= maxMonthsExcl) return false
  return true
}

function indicationMatches(rule: DosingRule, indicationId: string | null | undefined): boolean {
  if (!rule.indicationId) return true // rule is general-purpose
  return rule.indicationId === indicationId
}

export function selectRule(rules: DosingRule[], ctx: SelectionCtx): RuleSelection {
  const candidates = rules.filter(
    (r) =>
      r.referenceId === ctx.referenceId &&
      weightInBand(r, ctx.weightKg) &&
      ageInBand(r, ctx.ageMonths) &&
      indicationMatches(r, ctx.indicationId),
  )

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'NO_RULE_MATCH',
      detail:
        'No dosing rule matches this drug in the selected reference at this weight/age/indication. Do not improvise — check the primary source.',
    }
  }

  const minPriority = Math.min(...candidates.map((c) => c.priority))
  const top = candidates.filter((c) => c.priority === minPriority)
  if (top.length > 1) {
    return {
      ok: false,
      reason: 'AMBIGUOUS_RULE',
      detail: `${top.length} rules match equally (ids: ${top.map((r) => r.id).join(', ')}). Selection is ambiguous — fix the data (set distinct priorities) before use.`,
    }
  }
  return { ok: true, rule: top[0] }
}
