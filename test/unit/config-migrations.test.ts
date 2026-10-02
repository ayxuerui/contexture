import { describe, expect, it } from 'vitest';
import { isMap, isScalar, parseDocument, type Document } from 'yaml';
import { MIGRATION_STEPS, migrationFloor, runMigrations, type MigrationStep } from '../../src/config/migrations.js';
import { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';

/**
 * Walks a dotted key path through a zod object schema, unwrapping the
 * optional / default / prefault wrappers `StoreConfigSchema` puts around its
 * blocks. Returns whether the path names a declared key.
 */
function schemaDeclares(path: string): boolean {
  let node: unknown = StoreConfigSchema;
  for (const segment of path.split('.')) {
    // Peel wrappers until an object schema (or something that is not one) is reached.
    for (;;) {
      const def = (node as { def?: { innerType?: unknown; in?: unknown } }).def;
      if (def?.innerType !== undefined) node = def.innerType;
      else if (def?.in !== undefined) node = def.in;
      else break;
    }
    const shape = (node as { shape?: Record<string, unknown> }).shape;
    if (shape === undefined || !Object.prototype.hasOwnProperty.call(shape, segment)) return false;
    node = shape[segment];
  }
  return true;
}

/** Renames a key in place, keeping its position and its comments — the idiom design D1 prescribes. */
function renameKey(doc: Document, mapPath: string[], from: string, to: string): void {
  const map = mapPath.length === 0 ? doc.contents : doc.getIn(mapPath, true);
  if (!isMap(map)) throw new Error(`no map at ${mapPath.join('.')}`);
  const pair = map.items.find((item) => isScalar(item.key) && item.key.value === from);
  if (!pair || !isScalar(pair.key)) throw new Error(`no key ${from}`);
  pair.key.value = to;
}

describe('the shipped migration ladder', () => {
  // migrate-stores-on-update, store-lifecycle: "A missing step fails the test suite". A release
  // that raises SUPPORTED_SCHEMA_VERSION without a step from the previous version fails here,
  // naming the version that has none.
  it('has exactly one step for every version from its floor up to the supported version', () => {
    const floor = migrationFloor();
    for (let version = floor; version < SUPPORTED_SCHEMA_VERSION; version += 1) {
      const steps = MIGRATION_STEPS.filter((step) => step.from === version);
      expect(steps, `schema version ${version} needs exactly one migration step`).toHaveLength(1);
    }
    for (const step of MIGRATION_STEPS) {
      expect(step.from, 'a step may not start at or beyond the supported version').toBeLessThan(
        SUPPORTED_SCHEMA_VERSION,
      );
    }
  });

  // design D4: the typed schema accepts exactly one spelling of every key. A step's retired
  // spelling that is still declared is a second live contract.
  it('retires no key path the typed schema still declares', () => {
    for (const step of MIGRATION_STEPS) {
      for (const retired of step.retires) {
        expect(schemaDeclares(retired), `${retired} is retired by step ${step.from} but still declared`).toBe(false);
      }
    }
  });

  it('starts empty at the supported version', () => {
    // Both known stores were at the supported version when the ladder was introduced, so there
    // was nothing to carry. This pins that, so a step added without a version bump is noticed.
    expect(migrationFloor()).toBe(SUPPORTED_SCHEMA_VERSION);
  });

  it('can tell a declared key from an undeclared one', () => {
    // Guards the helper the retirement test depends on: without this, a helper that always
    // answered "not declared" would let every retired spelling through.
    expect(schemaDeclares('session.branch_prefix')).toBe(true);
    expect(schemaDeclares('git.default_branch')).toBe(true);
    expect(schemaDeclares('session.no_such_key')).toBe(false);
    expect(schemaDeclares('no_such_block.key')).toBe(false);
  });
});

describe('runMigrations', () => {
  const v = SUPPORTED_SCHEMA_VERSION;
  const ladder: MigrationStep[] = [
    { from: v - 2, retires: ['session.old_prefix'], apply: (doc) => renameKey(doc, ['session'], 'old_prefix', 'mid_prefix') },
    { from: v - 1, retires: ['session.mid_prefix'], apply: (doc) => renameKey(doc, ['session'], 'mid_prefix', 'branch_prefix') },
  ];

  const original = [
    '# contexture store configuration',
    '',
    `schema_version: ${v - 2} # recorded by init`,
    'git:',
    '  default_branch: trunk',
    '',
    'session:',
    "  worktrees_path: '.wt'",
    '  # the operator chose this prefix',
    '  old_prefix: work/ # trailing note',
    '  z_last: true',
    'taxonomy: { profile: custom, layers: [] }',
    '',
  ].join('\n');

  it('runs every step in order and changes only the renamed keys and the version', () => {
    const migrated = runMigrations(parseDocument(original), v - 2, ladder);
    const expected = original
      .replace(`schema_version: ${v - 2} # recorded by init`, `schema_version: ${v} # recorded by init`)
      .replace('  old_prefix: work/ # trailing note', '  branch_prefix: work/ # trailing note');
    expect(String(migrated)).toBe(expected);
  });

  it('starts at the recorded version, skipping steps below it', () => {
    const atMid = original
      .replace(`schema_version: ${v - 2}`, `schema_version: ${v - 1}`)
      .replace('old_prefix', 'mid_prefix');
    const migrated = runMigrations(parseDocument(atMid), v - 1, ladder);
    expect(String(migrated)).toContain('  branch_prefix: work/ # trailing note');
    expect(String(migrated)).toContain(`schema_version: ${v} # recorded by init`);
  });

  it('leaves the input document untouched when a step throws', () => {
    const doc = parseDocument(original);
    const failing: MigrationStep[] = [
      ladder[0] as MigrationStep,
      { from: v - 1, retires: [], apply: () => { throw new Error('cannot carry this'); } },
    ];
    expect(() => runMigrations(doc, v - 2, failing)).toThrow(`step ${v - 1} -> ${v} failed: cannot carry this`);
    expect(String(doc)).toBe(original);
  });

  it('refuses a gap in the ladder rather than skipping it', () => {
    expect(() => runMigrations(parseDocument(original), v - 2, [ladder[0] as MigrationStep])).toThrow(
      /no step carries this version forward/,
    );
  });

  it('puts the floor at the lowest step', () => {
    expect(migrationFloor(ladder)).toBe(v - 2);
  });
});
