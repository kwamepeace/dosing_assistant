/**
 * Reference sources. Two flags carry the licensing policy (see the project plan):
 *  - `notYetPopulated`: shown in the UI but has no dosing rules yet.
 *  - `licensed`: a proprietary source we may NOT transcribe into our own served
 *    dataset. It appears as "available once licensed" and stays empty until a
 *    real commercial/API licence exists — never populated from scraped content.
 *
 * Only Ghana STG 2017 ships populated in v1, and even its rules are unverified
 * placeholders until a pharmacist confirms each one against the book.
 */
import type { Reference } from './schema'

export const references: Reference[] = [
  {
    id: 'ghana-stg-2017',
    name: 'Ghana Standard Treatment Guidelines',
    shortName: 'Ghana STG',
    editionId: '2017',
    editionLabel: '7th edition, 2017',
    preferred: true,
    notYetPopulated: false,
    licensed: false,
  },
  {
    id: 'who-pocketbook-2013',
    name: 'WHO Pocket Book of Hospital Care for Children',
    shortName: 'WHO Pocket Book',
    editionId: '2013',
    editionLabel: '2nd edition, 2013',
    preferred: false,
    notYetPopulated: true, // reference #2 — planned, not yet entered
    licensed: false,
  },
  {
    id: 'bnfc',
    name: 'BNF for Children',
    shortName: 'BNFc',
    editionId: 'current',
    editionLabel: 'current online edition',
    preferred: false,
    notYetPopulated: true,
    licensed: true, // proprietary — needs a commercial licence before populating
  },
  {
    id: 'lexicomp',
    name: 'Lexicomp Pediatric & Neonatal Dosage Handbook',
    shortName: 'Lexicomp',
    editionId: 'current',
    editionLabel: 'current edition',
    preferred: false,
    notYetPopulated: true,
    licensed: true,
  },
]
