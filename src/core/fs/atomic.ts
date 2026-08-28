import { randomBytes } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes `contents` to `filePath` atomically: write to a temp file in the
 * SAME directory (so rename() is same-filesystem and therefore atomic on
 * POSIX), fsync it, then rename over the target. A process killed mid-write
 * leaves either the old complete file or nothing on disk — never a
 * truncated target. Used for every authored file contexture writes,
 * starting with `contexture.yaml` and `.gitignore` in `init`.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await open(tempPath, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tempPath, filePath);
  } catch (err) {
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }
}
