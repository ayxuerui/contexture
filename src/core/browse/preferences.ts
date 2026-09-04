export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const THEME_COOKIE = 'ctxr_theme';
const THEME_QUERY_PARAM = 'ctxr-theme';
const DEFAULT_THEME: ThemeMode = 'system';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Minimal Cookie-header parser: "name=value" pairs separated by "; ". The
 * first occurrence of a repeated name wins, the same resolution a browser
 * itself applies when more than one cookie shares a name.
 */
function parseCookies(header: string | undefined): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name.length === 0 || cookies.has(name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    cookies.set(name, value);
  }
  return cookies;
}

function isOneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): value is T {
  return value !== null && value !== undefined && (allowed as readonly string[]).includes(value);
}

interface ResolvedPreference<T extends string> {
  value: T;
  /** True when a query parameter, not the persisted cookie or the fallback, supplied this value — the caller should persist it. */
  fromQueryParam: boolean;
}

/**
 * design.md D6/D7 (serve-page-names-theme-and-nav-toggle): a query parameter overrides the
 * persisted cookie for this response and is what gets persisted going forward. An unrecognized
 * cookie value — absent, malformed, from an old or foreign build — is never trusted, and falls
 * back to `fallback` exactly as if no cookie had been sent at all.
 */
function resolvePreference<T extends string>(
  queryValue: string | null,
  cookieValue: string | undefined,
  allowed: readonly T[],
  fallback: T,
): ResolvedPreference<T> {
  if (isOneOf(queryValue, allowed)) return { value: queryValue, fromQueryParam: true };
  if (isOneOf(cookieValue, allowed)) return { value: cookieValue, fromQueryParam: false };
  return { value: fallback, fromQueryParam: false };
}

/** design.md D7: `Path=/`, a one-year lifetime, `SameSite=Lax`, and `HttpOnly` — nothing in this surface ever reads a cookie from script. */
function setCookieHeader(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`;
}

export interface ResolvedTheme {
  theme: ThemeMode;
  /** A `Set-Cookie` header value to persist the choice, present only when a query parameter just made it. */
  setCookie: string | undefined;
}

/**
 * design.md D6 (serve-page-names-theme-and-nav-toggle): resolves the theme for one response from
 * (in priority order) a `?ctxr-theme=` query parameter on the current request, the persisted
 * cookie, and finally `system` — never a route of its own, so this stays transparent to dispatch.
 */
export function resolveTheme(cookieHeader: string | undefined, searchParams: URLSearchParams): ResolvedTheme {
  const cookies = parseCookies(cookieHeader);
  const resolved = resolvePreference(searchParams.get(THEME_QUERY_PARAM), cookies.get(THEME_COOKIE), THEME_MODES, DEFAULT_THEME);
  return { theme: resolved.value, setCookie: resolved.fromQueryParam ? setCookieHeader(THEME_COOKIE, resolved.value) : undefined };
}

export type NavState = 'shown' | 'collapsed';

const NAV_STATES: readonly NavState[] = ['shown', 'collapsed'];
const NAV_COOKIE = 'ctxr_nav';
const NAV_QUERY_PARAM = 'ctxr-nav';
const DEFAULT_NAV_STATE: NavState = 'shown';

export interface ResolvedNavState {
  navState: NavState;
  /** A `Set-Cookie` header value to persist the choice, present only when a query parameter just made it. */
  setCookie: string | undefined;
}

/**
 * design.md D9 (serve-page-names-theme-and-nav-toggle): resolves the wide-viewport collapsed/shown
 * state the same way `resolveTheme` resolves a theme — a query parameter, else the persisted
 * cookie, else the default. This governs only the wide-viewport link; the narrow-viewport
 * disclosure is a plain CSS checkbox with no server-side state at all.
 */
export function resolveNavState(cookieHeader: string | undefined, searchParams: URLSearchParams): ResolvedNavState {
  const cookies = parseCookies(cookieHeader);
  const resolved = resolvePreference(searchParams.get(NAV_QUERY_PARAM), cookies.get(NAV_COOKIE), NAV_STATES, DEFAULT_NAV_STATE);
  return { navState: resolved.value, setCookie: resolved.fromQueryParam ? setCookieHeader(NAV_COOKIE, resolved.value) : undefined };
}
