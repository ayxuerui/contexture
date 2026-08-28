import { failClosedVisibilityCheck } from '../notes/checks.js';
import type { CheckDefinition } from './types.js';

/**
 * The only file later phases append to when they add a doctor/lint check:
 * one import, one array entry. Nothing else under checks/ changes.
 */
export const CHECKS: readonly CheckDefinition[] = [failClosedVisibilityCheck];
