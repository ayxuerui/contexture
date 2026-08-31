import { CATALOG_CHECKS } from './catalog-checks.js';
import { DISCLOSURE_CHECKS } from './disclosure-checks.js';
import { INTEGRITY_CHECKS } from './integrity-checks.js';
import { failClosedVisibilityCheck, failClosedVisibilityInvariantCheck } from '../notes/checks.js';
import { ORGANIZE_CHECKS } from './organize-checks.js';
import { WRITE_LIFECYCLE_CHECKS } from './write-lifecycle-checks.js';
import type { CheckDefinition } from './types.js';

/**
 * The only file later phases append to when they add a doctor/lint check:
 * one import, one array entry. Nothing else under checks/ changes.
 */
export const CHECKS: readonly CheckDefinition[] = [
  failClosedVisibilityCheck,
  failClosedVisibilityInvariantCheck,
  ...WRITE_LIFECYCLE_CHECKS,
  ...CATALOG_CHECKS,
  ...ORGANIZE_CHECKS,
  ...DISCLOSURE_CHECKS,
  ...INTEGRITY_CHECKS,
];
