import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The real built CLI entrypoint — shared by every helper that spawns it or pins CONTEXTURE_BIN to it. */
export const DIST_BIN = path.resolve(HERE, '../../dist/bin.js');
