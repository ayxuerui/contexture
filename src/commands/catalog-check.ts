import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { checkCatalogCoverage, checkCatalogStale, type CatalogStaleEntry } from '../core/catalog/build.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface CatalogCheckFlags {
  stale?: boolean;
}

export interface CatalogCheckData {
  missing: string[];
  dangling: string[];
  stale?: CatalogStaleEntry[];
}

/**
 * context-catalog spec: coverage is a hard invariant in both directions —
 * this exits non-zero if any retrievable note lacks an entry (missing) OR
 * any entry references a note that no longer exists (dangling, e.g.
 * deleted). Staleness (--stale) is a review prompt, not a coverage
 * violation, so it's reported but never fails the exit code on its own —
 * the same doctor/lint severity split applied elsewhere in this codebase.
 */
export async function execute(store: Store, flags: CatalogCheckFlags): Promise<CommandOutcome<CatalogCheckData>> {
  const { missing, dangling } = await checkCatalogCoverage(store);
  const stale = flags.stale ? await checkCatalogStale(store) : undefined;

  const findings: Finding[] = [
    ...missing.map((notePath) => ({
      code: 'catalog.coverage.missing',
      severity: 'error' as const,
      message: `"${notePath}" is retrievable but has no catalog entry.`,
      subject: notePath,
    })),
    ...dangling.map((notePath) => ({
      code: 'catalog.coverage.dangling',
      severity: 'error' as const,
      message: `A catalog entry references "${notePath}", which no longer exists.`,
      subject: notePath,
    })),
  ];
  if (stale) {
    findings.push(
      ...stale.map((entry) => ({
        code: 'catalog.stale',
        severity: 'warning' as const,
        message: `"${entry.path}" in section "${entry.section}" has changed since its gloss was last confirmed.`,
        subject: entry.path,
      })),
    );
  }

  const failed = missing.length > 0 || dangling.length > 0;
  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data: { missing, dangling, stale },
    findings,
    humanSummary: failed
      ? `${missing.length} missing, ${dangling.length} dangling catalog entr(y/ies).`
      : `Catalog coverage is complete.${stale ? ` ${stale.length} entr(y/ies) may need gloss review.` : ''}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
