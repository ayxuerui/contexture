import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import type { RunEnv } from '../../src/core/env.js';
import { buildTools, type ToolContext } from '../../src/core/mcp/tools/index.js';
import { alignmentProblems, TOOL_REGISTRY, routeForCommand, type CommandShape, type ToolEntry } from '../../src/core/mcp/tool-map.js';
import { buildProgram } from '../../src/run.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D9, task 5.3 (remote-access spec,
 * *Every tool is a file tool, a `ctxr` command, or a named exception*): the
 * tool registry, read from the mapping module, against the CLI's real command
 * registry, with `session` the one field a command's tool may add.
 */

const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/-/g, '_');

function commandShapes(): CommandShape[] {
  const { program } = buildProgram({ io: { stderr: { write: () => true } } } as unknown as RunEnv);
  const shapes: CommandShape[] = [];
  const walk = (cmd: Command, prefix: string[]): void => {
    for (const child of cmd.commands) {
      const words = [...prefix, child.name()];
      const params = [...child.options.map((o) => snake(o.attributeName())), ...child.registeredArguments.map((a) => snake(a.name()))];
      shapes.push({ path: words.join(' '), params });
      walk(child, words);
    }
  };
  walk(program, []);
  return shapes;
}

function toolFields(): Record<string, string[]> {
  const tools = buildTools({ view: {}, syncDeps: {}, write: {}, mutex: {}, baseUrl: undefined } as unknown as ToolContext);
  return Object.fromEntries(tools.map((t) => [t.name, Object.keys((t.inputSchema.properties ?? {}) as Record<string, unknown>)]));
}

describe('MCP tools align with ctxr commands (D9)', () => {
  const commands = commandShapes();

  it('passes on the shipped registry', () => {
    expect(commands.find((c) => c.path === 'session discard')?.params).toEqual(expect.arrayContaining(['force', 'close_pull_request', 'session']));
    expect(alignmentProblems(TOOL_REGISTRY, toolFields(), commands)).toEqual([]);
  });

  it('registers exactly the mapping module\'s tools, in its order', () => {
    expect(Object.keys(toolFields())).toEqual(TOOL_REGISTRY.map((t) => t.name));
  });

  it('fails on a tool with no command, naming it', () => {
    const seeded: ToolEntry[] = [...TOOL_REGISTRY, { name: 'session_publish', kind: 'command', command: 'session publish' }];
    const problems = alignmentProblems(seeded, { ...toolFields(), session_publish: ['session'] }, commands);
    expect(problems).toEqual([expect.stringMatching(/^session_publish: no `ctxr session publish` command/)]);
  });

  it('fails on a field the command does not register, and on an unnamed exception', () => {
    const fields = { ...toolFields(), session_rebase: ['session', 'action'] };
    expect(alignmentProblems(TOOL_REGISTRY, fields, commands)).toEqual([expect.stringMatching(/^session_rebase: action is not an option/)]);
    const seeded: ToolEntry[] = [...TOOL_REGISTRY, { name: 'summarize', kind: 'exception', reason: 'convenient' }];
    expect(alignmentProblems(seeded, toolFields(), commands)).toEqual([expect.stringMatching(/^summarize: not a named exception/)]);
  });

  it('routes every command step through one mapping, with session capture through ctxr_write', () => {
    expect(routeForCommand('session submit')).toEqual({ via: 'tool', tool: 'session_submit' });
    expect(routeForCommand('session capture')).toEqual({ via: 'ctxr_write' });
    expect(routeForCommand('graph query neighbors')).toEqual({ via: 'ctxr' });
    expect(routeForCommand('update')).toBeNull();
    expect(routeForCommand('land')).toBeNull();
  });
});
