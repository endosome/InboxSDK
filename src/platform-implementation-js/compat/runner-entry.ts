/**
 * Bundled (IIFE, global `CalsdkCompat`) and injected into a page by
 * `tools/calendar-probe/compat-runner.mjs`, so the CDP runner executes the very
 * same checks as `sdk.Compat` — no second implementation to drift.
 */
import { runCompatChecks, type Candidates } from './checks';
import { CALENDAR_SELECTORS } from '../dom-driver/google-calendar/selectors';

/** `patch` REPLACES whole chains (the drill uses this; overrides in the SDK only prepend). */
export function run(patch: Partial<Record<string, readonly string[]>> = {}) {
  return runCompatChecks(document, {
    ...CALENDAR_SELECTORS,
    ...patch,
  } as Candidates);
}

export { compareStructure } from './checks';
