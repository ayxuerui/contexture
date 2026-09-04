import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * isolate-the-portability-test (D4): resolves a command name on the executable
 * search path, returning where it was found or null.
 *
 * `PATH` is read from the passed environment, never `process.env`, so a test
 * can point it at a temp directory without touching the real one — and the
 * source-level guard that only `core/env.ts` reads process state keeps
 * holding. Nothing is executed: presence is the question, and running an
 * unknown binary to ask it would be a different and worse one.
 */
export async function resolveOnPath(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<string | null> {
  const search = env.PATH;
  if (search === undefined || search === '') return null;
  for (const dir of search.split(path.delimiter)) {
    if (dir === '') continue;
    const candidate = path.join(dir, command);
    try {
      await access(candidate, constants.X_OK);
      // A DIRECTORY named `gh` also passes X_OK — that bit means "searchable"
      // on a directory — so reporting one as the resolved tool would be a
      // false positive. `command -v` skips them for the same reason.
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Not here, or here but not executable — keep looking; first match wins.
    }
  }
  return null;
}
