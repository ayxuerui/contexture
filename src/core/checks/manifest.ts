import type { CheckDefinition } from './types.js';

/**
 * The only file later phases append to when they add a doctor/lint check:
 * one import, one array entry. Nothing else under checks/ changes.
 * Phase 0 ships this empty, per task 0.8's "starts with zero checks
 * registered."
 */
export const CHECKS: readonly CheckDefinition[] = [];
