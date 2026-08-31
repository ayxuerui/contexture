import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { ExitCode } from '../core/exit-codes.js';
import { InvalidCaptureProposalError } from '../core/errors.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import type { Store } from '../core/store.js';
import { sanctionedPath } from '../core/write-lifecycle/path-gate.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionCaptureFlags {
  proposal: string;
}

interface NoteItem {
  id?: string;
  path: string;
  mode: 'create' | 'append';
  visibility?: string;
  frontmatter?: Record<string, unknown>;
  body: string;
}

interface CaptureProposal {
  notes?: NoteItem[];
}

export type CaptureOutcomeKind = 'wrote' | 'appended' | 'refused';

export interface CaptureItemReport {
  id: string;
  kind: 'note';
  path?: string;
  outcome: CaptureOutcomeKind;
  reason?: string;
}

export interface SessionCaptureData {
  items: CaptureItemReport[];
}

/**
 * session-capture-command spec (D1): the proposal file is the contract
 * between judgment (the agent, in conversation) and execution (this
 * command) — the agent writes only approved items, so "approve by id"
 * happens entirely in the conversation and this command never needs to
 * know about approval at all.
 */
function renderNote(frontmatter: Record<string, unknown> | undefined, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return body;
  return `---\n${stringifyYaml(frontmatter, { indent: 2 })}---\n${body}`;
}

async function applyNote(store: Store, id: string, item: NoteItem): Promise<CaptureItemReport> {
  if (item.mode !== 'create' && item.mode !== 'append') {
    return { id, kind: 'note', path: item.path, outcome: 'refused', reason: 'mode must be "create" or "append"' };
  }
  const gate = await sanctionedPath(store.config, store.root, item.path);
  if (!gate.ok) {
    return { id, kind: 'note', path: item.path, outcome: 'refused', reason: gate.reason };
  }
  const absolutePath = path.join(store.root, item.path);
  const exists = existsSync(absolutePath);

  if (item.mode === 'create') {
    if (exists) return { id, kind: 'note', path: item.path, outcome: 'refused', reason: 'already exists; use mode: append' };
    const frontmatter: Record<string, unknown> = { ...item.frontmatter };
    if (item.visibility !== undefined) frontmatter[store.config.fields.visibility] = item.visibility;
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFileAtomic(absolutePath, renderNote(frontmatter, item.body));
    return { id, kind: 'note', path: item.path, outcome: 'wrote' };
  }

  if (!exists) return { id, kind: 'note', path: item.path, outcome: 'refused', reason: 'append target does not exist' };
  const existing = await readFile(absolutePath, 'utf8');
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await writeFileAtomic(absolutePath, `${existing}${separator}${item.body}`);
  return { id, kind: 'note', path: item.path, outcome: 'appended' };
}

/**
 * session-capture-command spec (D2): every item is validated and applied
 * independently — one bad path never blocks the rest. Nothing is scanned
 * or inferred beyond the proposal; judgment already happened in the
 * conversation that produced it.
 */
export async function execute(store: Store, flags: SessionCaptureFlags): Promise<CommandOutcome<SessionCaptureData>> {
  let raw: string;
  try {
    raw = await readFile(flags.proposal, 'utf8');
  } catch (err) {
    throw new InvalidCaptureProposalError(flags.proposal, err instanceof Error ? err.message : String(err));
  }

  let proposal: CaptureProposal;
  try {
    proposal = (parseYaml(raw) ?? {}) as CaptureProposal;
  } catch (err) {
    throw new InvalidCaptureProposalError(flags.proposal, err instanceof Error ? err.message : String(err));
  }

  // remove-agent-identity: a proposal built for the pre-removal contract may still
  // declare these — reject loudly rather than silently drop items the caller thought
  // were being applied.
  const unsupportedKeys = Object.keys(proposal).filter((key) => key !== 'notes');
  if (unsupportedKeys.length > 0) {
    throw new InvalidCaptureProposalError(
      flags.proposal,
      `unsupported key(s): ${unsupportedKeys.join(', ')} — session capture applies store notes only`,
    );
  }

  const items: CaptureItemReport[] = [];
  for (const [index, item] of (proposal.notes ?? []).entries()) {
    items.push(await applyNote(store, item.id ?? `notes[${index}]`, item));
  }

  const refused = items.filter((item) => item.outcome === 'refused');
  const written = items.filter((item) => item.outcome === 'wrote' || item.outcome === 'appended');

  return {
    exitCode: refused.length > 0 ? ExitCode.CheckFailed : ExitCode.Ok,
    data: { items },
    findings: [],
    humanSummary:
      `${written.length} item(s) written` +
      (refused.length > 0 ? `; ${refused.length} refused: ${refused.map((item) => `${item.id} (${item.reason})`).join(', ')}` : '.'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
