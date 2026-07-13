/**
 * Unit dimensions, conversions and rounding helpers.
 *
 * The single most important safety primitive: a Quantity is normalised to a
 * canonical base (mass -> mg, volume -> mL) before ANY arithmetic, and the
 * engine refuses to mix dimensions. Units like IU/mmol are recognised but have
 * no mass/volume base, so the engine declines to compute them rather than
 * silently mishandling (e.g. insulin).
 */
import type { Quantity, Unit } from '../data/schema'

export type Dimension = 'mass' | 'volume' | 'international_unit' | 'molar' | 'count'

export const UNIT_DIMENSION: Record<Unit, Dimension> = {
  mcg: 'mass',
  mg: 'mass',
  g: 'mass',
  mL: 'volume',
  L: 'volume',
  IU: 'international_unit',
  mmol: 'molar',
  tablet: 'count',
  capsule: 'count',
  sachet: 'count',
  vial: 'count',
}

const MASS_TO_MG: Partial<Record<Unit, number>> = { mcg: 0.001, mg: 1, g: 1000 }
const VOLUME_TO_ML: Partial<Record<Unit, number>> = { mL: 1, L: 1000 }

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_DIMENSION[unit]
}

/** Convert a mass Quantity to milligrams. Returns null if not a mass. */
export function toMg(q: Quantity): number | null {
  const f = MASS_TO_MG[q.unit]
  return f === undefined ? null : q.value * f
}

/** Convert milligrams to a chosen mass unit (display pinning, no auto-switch). */
export function fromMg(mg: number, unit: Unit): number {
  const f = MASS_TO_MG[unit]
  return f === undefined ? mg : mg / f
}

/** Convert a volume Quantity to millilitres. Returns null if not a volume. */
export function toMl(q: Quantity): number | null {
  const f = VOLUME_TO_ML[q.unit]
  return f === undefined ? null : q.value * f
}

/** Round to `dp` decimal places (default 4) — kills binary-float artefacts. */
export function round(v: number, dp = 4): number {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

/** Nearest multiple of `step` (the measurable-volume / tablet-fraction grid). */
export function roundToStep(value: number, step: number): number {
  if (!step || step <= 0) return value
  return round(Math.round(value / step) * step, 4)
}

/** Round UP to a whole number of packs (epsilon guard: exact 200 mL -> 2, not 3). */
export function ceilWithEpsilon(value: number, eps = 1e-9): number {
  return Math.ceil(value - eps)
}

/**
 * Snap a unit-count to the nearest allowed fraction (e.g. [1, 0.5] for a scored
 * tablet, [1] for unscored). Returns the snapped value and whether snapping
 * required a fraction the formulation does not permit.
 */
export function snapToAllowedFraction(
  raw: number,
  allowedFractions: number[],
): { snapped: number; requiresDisallowedSplit: boolean } {
  // The granularity is the smallest allowed fraction (0.5 if halves allowed, else 1).
  const step = Math.min(...allowedFractions.filter((f) => f > 0))
  const snapped = round(Math.round(raw / step) * step, 4)
  // If the raw value wasn't already on the grid, a real split was needed.
  const requiresDisallowedSplit = step >= 1 && Math.abs(raw - Math.round(raw)) > 1e-6
  return { snapped, requiresDisallowedSplit }
}
