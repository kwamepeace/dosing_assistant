/** Auth/profile shapes, mirroring the `profiles` table in the Supabase migration. */

/** Self-selectable clinical roles. `reviewer`/`admin` exist in the DB enum but
 *  are granted by an admin, never chosen at sign-up (no self-promotion). */
export type ClinicalRole = 'nurse' | 'doctor' | 'pharmacist'
export type AppRole = ClinicalRole | 'reviewer' | 'admin'

export interface Profile {
  id: string
  full_name: string | null
  role: AppRole
  registration_number: string | null
  registration_body: string | null
  registration_verified: boolean
}

/** Ghanaian professional registers, paired with the role they license. */
export const REGISTRATION_BODIES: Array<{ id: string; label: string; roles: ClinicalRole[] }> = [
  { id: 'pcg', label: 'Pharmacy Council of Ghana', roles: ['pharmacist'] },
  { id: 'mdc', label: 'Medical & Dental Council', roles: ['doctor'] },
  { id: 'nmc', label: 'Nursing & Midwifery Council', roles: ['nurse'] },
]

export const ROLE_LABEL: Record<ClinicalRole, string> = {
  pharmacist: 'Pharmacist',
  doctor: 'Doctor',
  nurse: 'Nurse / Midwife',
}

/** The register expected for a given role (for the sign-up default). */
export function bodyForRole(role: ClinicalRole): string {
  return REGISTRATION_BODIES.find((b) => b.roles.includes(role))?.label ?? ''
}
