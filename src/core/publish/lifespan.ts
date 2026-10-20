/**
 * two-kinds-of-published-page: a page's lifespan, read from where it is filed
 * and from nothing else (design.md D3). A page whose folder's first segment
 * under the configured publish path is `disposable` is disposable; every
 * other page is permanent, so every page that predates this change is
 * permanent without being touched.
 */

export type PageLifespan = 'permanent' | 'disposable';

/**
 * D2: a fixed segment, not a config key — a key would have to be opt-in with
 * no shipped default, which makes the feature off in every store. The plain
 * word can collide with a store folder named "Disposable" (it slugifies to
 * exactly this), so the name is RESERVED rather than unreachable: `publish new`
 * refuses a slug spelled into it without `--disposable`, `publish gather`
 * derives no filing path into it, and `publish check` reads anything filed
 * there as disposable and fails its shape. `_disposable` would have made the
 * collision structurally impossible, and lost on how it reads in a URL.
 */
export const DISPOSABLE_SEGMENT = 'disposable';

/** D6: the window after which lint lists a disposable page as a removal candidate. A code constant, not config. */
export const DISPOSABLE_REVIEW_DAYS = 30;

function normalizedPrefix(publishPath: string): string {
  return publishPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * The lifespan of a page (or any file under it), given its store-relative
 * path. `null` when the path is not under the configured publish path — such
 * a file is not a published page and has no lifespan.
 */
export function lifespanOf(relativePath: string, publishPath: string): PageLifespan | null {
  const prefix = normalizedPrefix(publishPath);
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized.startsWith(`${prefix}/`)) return null;
  const firstSegment = normalized.slice(prefix.length + 1).split('/')[0];
  return firstSegment === DISPOSABLE_SEGMENT ? 'disposable' : 'permanent';
}

/**
 * The `YYYY-MM-DD-` lead of a dated name: a disposable page's folder, stamped
 * by `ctxr publish new --disposable`, and a page's PDF rendering without its
 * `.pdf` extension (file-pdfs-beside-their-page D4). At least one character
 * must follow the date.
 */
const LEADING_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})-./;

/**
 * The calendar date leading a dated name, as `YYYY-MM-DD`, or `null` when the
 * name carries none or the date is not a real one (`2026-13-45`,
 * `2026-02-30`). Round-tripping through `Date.UTC` is what rejects a day the
 * month does not have.
 */
export function parseLeadingDate(name: string): string | null {
  const match = LEADING_DATE_RE.exec(name);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Whole days from `date` to `today`, both `YYYY-MM-DD`. */
export function daysBetween(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}
