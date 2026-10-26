import { crc32, deflateRawSync } from 'node:zlib';

/**
 * serve-the-session-lifecycle-to-chat-apps D7: the plugin archives both apps
 * upload. A minimal ZIP writer over `node:zlib` rather than a dependency: the
 * archive holds a few dozen small text files, and nothing here needs
 * encryption, ZIP64 or streaming.
 *
 * Byte-stable for the same input: entries are written in path order and every
 * entry carries the same fixed timestamp (1980-01-01, the format's epoch), so
 * an archive built twice from one commit and configuration is the same file.
 */
export interface ZipEntry {
  /** Posix path inside the archive, with no leading `/`. */
  path: string;
  data: Buffer;
}

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** Bit 11: the entry's name is UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const VERSION_NEEDED = 20;
/** Made by Unix (3), spec version 2.0, so the external attributes carry a file mode. */
const VERSION_MADE_BY = (3 << 8) | 20;
const FILE_MODE = 0o100644;

export function createZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();

  for (const entry of sorted) {
    if (entry.path === '' || entry.path.startsWith('/') || entry.path.split('/').includes('..')) throw new Error(`unsafe archive path: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`duplicate archive path: ${entry.path}`);
    seen.add(entry.path);
    const name = Buffer.from(entry.path, 'utf8');
    const deflated = deflateRawSync(entry.data, { level: 9 });
    const method = deflated.length < entry.data.length ? METHOD_DEFLATE : METHOD_STORE;
    const body = method === METHOD_DEFLATE ? deflated : entry.data;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE((FILE_MODE << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDirectory, end]);
}
