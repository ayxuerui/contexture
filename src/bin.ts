#!/usr/bin/env node
import { realEnv } from './core/env.js';
import { run } from './run.js';

const exitCode = await run(process.argv.slice(2), realEnv());
process.exitCode = exitCode;
