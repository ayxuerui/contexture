import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { IdentitySchema, isAbsoluteHttpBase, PersonEntrySchema, SecondOpinionSchema } from '../../config/schema.js';
import { identifyFile, identityKey } from '../browse/serving-state.js';
import { SecondOpinionUsageError } from '../errors.js';

/**
 * offer-the-second-opinion-on-its-own D8 (cli-contract spec, *The
 * second-opinion server's file is strict and holds no secret*): the one file
 * `ctxr second-opinion serve` reads. It is not a store's configuration and
 * sits in no store: flat names for the four things the server needs, built
 * from the store schema's own parts so an entry means the same in both.
 *
 * - `base_url`: the origin the server is reached at. Sign-in and `/mcp` are
 *   served at its root, so a path is refused.
 * - `identity`: the signed assertion the access proxy in front forwards, as a
 *   store's `change_approval.identity`.
 * - `members`: who may sign in, as exact emails or `@domain` suffixes. Each
 *   holds the `second-opinion` scope and no other.
 * - `second_opinion`: the lineup, as a store's block, with its shipped defaults.
 *
 * Strict at every level: an unknown key fails the load by name. No key holds
 * a secret, so writing one fails the same way; the OpenRouter key and every
 * token stay in the environment.
 */
function isOrigin(value: string): boolean {
  if (!isAbsoluteHttpBase(value)) return false;
  const url = new URL(value);
  return (url.pathname === '/' || url.pathname === '') && url.username === '' && url.password === '';
}

export const SecondOpinionServeSchema = z.strictObject({
  base_url: z.string().min(1).refine(isOrigin, { message: 'must be an http(s) origin with no path, e.g. "https://opinion.example.com": sign-in is served at the root of the origin' }),
  identity: IdentitySchema.strict(),
  members: z.array(PersonEntrySchema).min(1, { message: 'name at least one member' }),
  second_opinion: SecondOpinionSchema.prefault({}),
});
export type SecondOpinionServeConfig = z.infer<typeof SecondOpinionServeSchema>;

/** One line per problem, each naming its key. An unknown key is named itself, not only its parent. */
function problems(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    const at = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') return issue.keys.map((key) => `${[...at, key].join('.')}: unknown key`);
    return [`${at.length === 0 ? '(root)' : at.join('.')}: ${issue.message}`];
  });
}

/** Reads and validates the file; a missing, unreadable or invalid one is a usage error naming the file. */
export async function loadServeConfig(file: string): Promise<SecondOpinionServeConfig> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new SecondOpinionUsageError(code === 'ENOENT' ? `"${file}" does not exist; --config names the second-opinion server's file` : `"${file}" cannot be read (${code ?? String(err)})`, { file });
  }
  let document: unknown;
  try {
    document = parse(text);
  } catch (err) {
    throw new SecondOpinionUsageError(`"${file}" is not valid YAML: ${err instanceof Error ? err.message : String(err)}`, { file });
  }
  const parsed = SecondOpinionServeSchema.safeParse(document ?? {});
  if (!parsed.success) {
    const issues = problems(parsed.error);
    throw new SecondOpinionUsageError(`"${file}" failed validation: ${issues.join('; ')}`, { file, issues });
  }
  return parsed.data;
}

export interface ServeConfigFollower {
  current(): Promise<SecondOpinionServeConfig>;
}

/**
 * D8, "it follows the file": one `stat` per request, by the check `ctxr serve`
 * uses for `contexture.yaml` (serve-follows-config-changes D1). A changed file
 * is read and validated again, so a member removed from it is refused on
 * their next call. One that does not load leaves the last good one in force
 * and is reported once.
 */
export async function followServeConfig(file: string, initial: SecondOpinionServeConfig, log: (line: string) => void): Promise<ServeConfigFollower> {
  let config = initial;
  let seen = identityKey(await identifyFile(file));
  let lastFailure: string | null = null;
  let busy: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    let key: string;
    try {
      key = identityKey(await identifyFile(file));
    } catch (err) {
      const reason = `${file} cannot be read (${err instanceof Error ? err.message : String(err)})`;
      if (lastFailure !== reason) log(`second-opinion serve: ${reason}; still serving the file loaded before.`);
      lastFailure = reason;
      return;
    }
    if (key === seen) return;
    seen = key;
    try {
      config = await loadServeConfig(file);
      lastFailure = null;
      log(`second-opinion serve: reloaded ${file}.`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (lastFailure !== reason) log(`second-opinion serve: ${reason}; still serving the file loaded before.`);
      lastFailure = reason;
    }
  }

  return {
    async current() {
      busy ??= refresh().finally(() => {
        busy = null;
      });
      await busy;
      return config;
    },
  };
}
