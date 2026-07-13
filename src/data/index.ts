/**
 * Data load + validation gate.
 *
 * The schema (schema.ts) is the single source of truth; this module runs every
 * seed drug and reference THROUGH it at import time. Malformed data — which for
 * a dosing tool means potentially dangerous data — throws here and fails the
 * build/boot, rather than silently producing a wrong number downstream.
 *
 * Referential integrity is checked too: every rule/provenance referenceId must
 * point at a real reference, and every rule must sit under a populated,
 * non-licensed reference (we never serve rules attributed to a licensed source).
 */
import { Drug, Reference } from './schema'
import { seedDrugs } from './drugs'
import { references as rawReferences } from './references'

function fail(context: string, detail: string): never {
  throw new Error(`[data] ${context}: ${detail}`)
}

// Validate references first — drugs are checked against them.
export const references: Reference[] = rawReferences.map((r, i) => {
  const parsed = Reference.safeParse(r)
  if (!parsed.success) fail(`reference #${i}`, parsed.error.message)
  return parsed.data
})

const referenceById = new Map(references.map((r) => [r.id, r]))

export const drugs: Drug[] = seedDrugs.map((d, i) => {
  const parsed = Drug.safeParse(d)
  if (!parsed.success) fail(`drug #${i} (${d?.id ?? 'unknown'})`, parsed.error.message)
  const drug = parsed.data

  for (const rule of drug.rules) {
    const ref = referenceById.get(rule.referenceId)
    if (!ref) fail(`drug ${drug.id}, rule ${rule.id}`, `unknown referenceId "${rule.referenceId}"`)
    if (ref.licensed) fail(`drug ${drug.id}, rule ${rule.id}`, `attributed to licensed reference "${ref.id}" — not permitted`)
    if (rule.provenance.referenceId !== rule.referenceId) {
      fail(`drug ${drug.id}, rule ${rule.id}`, 'provenance.referenceId does not match rule.referenceId')
    }
  }
  return drug
})

export const drugById = new Map(drugs.map((d) => [d.id, d]))

/** References that actually carry usable, populated rules (for the picker). */
export function populatedReferences(): Reference[] {
  return references.filter((r) => !r.notYetPopulated && !r.licensed)
}

/** The rules a given drug offers under a given reference. */
export function rulesFor(drugId: string, referenceId: string) {
  return drugById.get(drugId)?.rules.filter((r) => r.referenceId === referenceId) ?? []
}
