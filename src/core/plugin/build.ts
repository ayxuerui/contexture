import { readdirSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_VENDORED_SKILLS } from '../../config/defaults.js';
import type { StoreConfig } from '../../config/schema.js';
import { escapeHtml } from '../browse/render.js';
import { SKILL_FILE_NAME } from '../conventions.js';
import { ContextureError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import type { GitRunner } from '../git/exec.js';
import { renderMcpSkills } from '../skills.js';
import { commandMapProblems, PLUGIN_COMMANDS } from './commands.js';
import { createZip } from './zip.js';

/**
 * The one builder behind `ctxr plugin build`, `npm run plugin` and serve's
 * `/plugin/` page. It does no I/O of its own beyond reading the packaged
 * templates, so the command writes what it returns to disk and the server
 * answers with it from memory.
 *
 * publish-one-contexture-plugin D1 (harness-portability spec, *contexture
 * publishes one plugin for every store*): the Claude plugin is contexture's,
 * not a store's. It is the MCP render of the owned skills, which takes no
 * configuration, with a README and contexture's license, and no MCP server
 * entry: each member adds their store's connector once, by its `/mcp` address.
 * Its version is the CLI's, so a member's marketplace installs a new copy
 * exactly at a release (D3). The repository commits it under `plugins/contexture/`.
 *
 * The ChatGPT plugin stays the store's (serve-the-session-lifecycle-to-chat-apps
 * D7): ChatGPT has no marketplace on a personal plan, so it is the store's zip
 * from `/plugin/`, carrying the same skills and one remote MCP server entry at
 * `serve.base_url` + `/mcp`.
 *
 * Neither carries a credential (sign-in is the server's own OAuth with dynamic
 * client registration), a variable in an address, a hook, a local server or a
 * top-level `bin/` directory: the trees below are the whole of what is written.
 */

export const PLUGIN_TARGETS = ['claude', 'chatgpt'] as const;
export type PluginTarget = (typeof PLUGIN_TARGETS)[number];

/** Both vendors cap a plugin's and a skill's name at 64 characters, and a skill's description at 1,024. */
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
const NAME_PREFIX = 'contexture-';

/** The general Claude plugin's name (D5, revision 11: `contexture`, the product's name as plugins conventionally are, so its commands read `/contexture:submit`), and the marketplace in contexture's repository that lists it (D1). */
export const CLAUDE_PLUGIN_NAME = 'contexture';
export const CLAUDE_PLUGIN_DISPLAY_NAME = 'contexture';
export const PLUGIN_MARKETPLACE = 'ayxuerui/contexture';

export interface BuiltPlugin {
  target: PluginTarget;
  name: string;
  version: string;
  /** Every file of the plugin directory, by posix path relative to it. */
  files: ReadonlyMap<string, string>;
  /** The skill directories it carries. */
  skills: string[];
  archiveName: string;
  /** The same files, as one ZIP archive with the manifest at its root. */
  archive: Buffer;
}

export interface StorePluginInput {
  config: StoreConfig;
  /** The store's name, which the ChatGPT plugin's name and display name derive from. */
  storeName: string;
  cliVersion: string;
  /** The commit the plugin is rendered from; null in a repository with no commit yet. */
  commit: string | null;
}

export interface StorePlugin extends BuiltPlugin {
  storeName: string;
  displayName: string;
  mcpUrl: string;
}

/** The configuration error a store without the MCP surface gets for its ChatGPT plugin: there is no server for it to name. */
export class PluginWithoutMcpError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'plugin.mcp_not_declared',
      severity: 'error',
      message: 'This store declares no mcp block in contexture.yaml, so there is no MCP server for a ChatGPT plugin to connect to. Declare mcp (which needs change_approval and serve.base_url) first.',
    });
  }
}

const templateCache = new Map<string, string>();

/**
 * `templates/plugin/<file>`. Read whole, not through `packagedTemplate()`:
 * these are JSON and HTML documents, not markdown fragments.
 */
function pluginTemplate(file: string): string {
  let text = templateCache.get(file);
  if (text === undefined) {
    text = readFileSync(fileURLToPath(new URL(`../../../templates/plugin/${file}`, import.meta.url)), 'utf8');
    templateCache.set(file, text);
  }
  return text;
}

/** A file at the package root (LICENSE, package.json), which npm ships with every install. */
function packageFile(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), 'utf8');
}

type Escape = (value: string) => string;
const asJsonString: Escape = (value) => JSON.stringify(value).slice(1, -1);
const asIs: Escape = (value) => value;

/** One pass, so a substituted value that happens to contain a token is never substituted again. */
export function fillPluginTemplate(file: string, values: Readonly<Record<string, string>>, escape: Escape = file.endsWith('.json') ? asJsonString : file.endsWith('.html') ? escapeHtml : asIs): string {
  return pluginTemplate(file).replace(/__[A-Z][A-Z0-9_]*__/g, (token) => {
    const value = values[token.slice(2, -2)];
    if (value === undefined) throw new Error(`templates/plugin/${file} carries an unknown placeholder ${token}`);
    return escape(value);
  });
}

/** A JSON template, filled and parsed, so a template that stops being JSON fails the build rather than shipping. */
function jsonDocument(file: string, values: Readonly<Record<string, string>>): string {
  return `${JSON.stringify(JSON.parse(fillPluginTemplate(file, values)), null, 2)}\n`;
}

/** `contexture-<store name slug>`, within the 64-character limit both vendors set. */
export function pluginName(storeName: string): string {
  const slug = storeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${NAME_PREFIX}${slug === '' ? 'store' : slug}`.slice(0, MAX_NAME_LENGTH).replace(/-+$/, '');
}

/** The CLI version, with the rendered commit as semver build metadata. */
export function pluginVersion(cliVersion: string, commit: string | null): string {
  return commit === null ? cliVersion : `${cliVersion}+${commit.slice(0, 12)}`;
}

/** Reads a rendered SKILL.md's frontmatter and holds it to the Agent Skills limits both vendors apply. */
function checkSkillFrontmatter(folder: string, content: string): void {
  const match = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(content);
  if (match === null) throw new Error(`skill ${folder} renders no name and description frontmatter`);
  const [, name, description] = match as unknown as [string, string, string];
  if (name !== folder) throw new Error(`skill ${folder} is named "${name}" in its frontmatter`);
  if (name.length > MAX_NAME_LENGTH || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`skill name "${name}" is not a lowercase name of at most ${MAX_NAME_LENGTH} characters`);
  if (description.length === 0 || description.length > MAX_DESCRIPTION_LENGTH) throw new Error(`skill ${folder}'s description is not 1 to ${MAX_DESCRIPTION_LENGTH} characters`);
}

/** A rendered skill's text below its frontmatter: what a command opening it carries. */
export function skillBody(content: string): string {
  const match = /^---\n[^]*?\n---\n\n?/.exec(content);
  if (match === null) throw new Error('a rendered skill carries no frontmatter');
  return content.slice(match[0].length).replace(/\n+$/, '');
}

/**
 * publish-one-contexture-plugin D5: `commands/<name>.md` for each entry of the
 * command map, from `templates/plugin/command.md`: a `description` worded as a
 * typed shortcut and nothing else in the frontmatter, then the whole MCP render
 * of the skill, then the person's `$ARGUMENTS`. Whichever of the two Claude
 * loads, it has the whole procedure. A command whose skill the plugin does not
 * carry fails the build.
 */
function commandFiles(skills: readonly { file: string; content: string }[], commands: Readonly<Record<string, string>> = PLUGIN_COMMANDS): Map<string, string> {
  const problems = commandMapProblems(commands, skills.map((skill) => skill.file));
  if (problems.length > 0) throw new Error(problems.join('; '));
  const files = new Map<string, string>();
  for (const [command, skill] of Object.entries(commands)) {
    const content = skills.find((s) => s.file === skill)!.content;
    files.set(`commands/${command}.md`, fillPluginTemplate('command.md', { PLUGIN: CLAUDE_PLUGIN_NAME, COMMAND: command, SKILL: skill, BODY: skillBody(content) }));
  }
  return files;
}

/** The MCP render's skills, as plugin files: the same text in both plugins and for every store. */
function skillFiles(): { skills: string[]; files: Map<string, string> } {
  const skills = renderMcpSkills();
  const files = new Map<string, string>();
  for (const skill of skills) {
    checkSkillFrontmatter(skill.file, skill.content);
    files.set(`skills/${skill.file}/${SKILL_FILE_NAME}`, skill.content);
    for (const [rel, content] of skill.supportingFiles) files.set(`skills/${skill.file}/${rel}`, content);
  }
  return { skills: skills.map((skill) => skill.file), files };
}

/** The packaged provenance record of a vendored skill: the install's ownership mark, which a plugin does not carry. */
const VENDORED_PROVENANCE_TEMPLATE = 'provenance.json';

/** Every file under `templates/vendor/<name>/`, as sorted posix paths relative to it. */
function vendoredTemplateFiles(dir: string, sub = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, sub), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
    if (entry.isDirectory()) out.push(...vendoredTemplateFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * publish-through-the-plugin D3 (harness-portability spec, *The plugin carries
 * the default craft skills with their licenses*): the vendored skills every
 * store gets by default, which `ctxr-publish` step 5 delegates to, as the same
 * packaged copies `ctxr init` writes into a store: unchanged, each beside its
 * license, without the provenance record. `THIRD_PARTY_NOTICES.md` travels at
 * the plugin's root, as it does in the package.
 */
function vendoredSkillFiles(): { skills: string[]; files: Map<string, string> } {
  const files = new Map<string, string>();
  for (const name of DEFAULT_VENDORED_SKILLS) {
    const dir = fileURLToPath(new URL(`../../../templates/vendor/${name}`, import.meta.url));
    const carried = vendoredTemplateFiles(dir).filter((rel) => rel !== VENDORED_PROVENANCE_TEMPLATE);
    if (!carried.includes(SKILL_FILE_NAME)) throw new Error(`vendored skill ${name} has no ${SKILL_FILE_NAME}`);
    for (const rel of carried) files.set(`skills/${name}/${rel}`, readFileSync(path.join(dir, ...rel.split('/')), 'utf8'));
  }
  files.set(THIRD_PARTY_NOTICES_FILE, packageFile(THIRD_PARTY_NOTICES_FILE));
  return { skills: [...DEFAULT_VENDORED_SKILLS], files };
}

/** The package's record of what it vendors, under what terms; shipped with the package and with each plugin. */
export const THIRD_PARTY_NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';

/** How a plugin README names the third-party skills it carries. */
function thirdPartyNames(): string {
  const names = DEFAULT_VENDORED_SKILLS.map((name) => `\`${name}\``);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
}

function finish(target: PluginTarget, name: string, version: string, skills: string[], files: Map<string, string>, archiveName: string): BuiltPlugin {
  for (const file of files.keys()) {
    // A Claude plugin with a top-level bin/ is refused at upload, and neither app runs a hook from a plugin we ship.
    if (file === 'bin' || file.startsWith('bin/') || file.startsWith('hooks/') || file === '.mcp.json') throw new Error(`plugin file ${file} is one this plugin may not carry`);
  }
  // Sorted by path, so the archive and a directory comparison never depend on insertion order.
  const sorted = new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    target,
    name,
    version,
    files: sorted,
    skills,
    archiveName,
    archive: createZip([...sorted].map(([file, content]) => ({ path: file, data: Buffer.from(content, 'utf8') }))),
  };
}

/**
 * publish-one-contexture-plugin D1, D3: contexture's Claude plugin, read from
 * nothing but the package. `cliVersion` is the version it carries, the CLI's.
 */
export function buildClaudePlugin(cliVersion: string): BuiltPlugin {
  const license = (JSON.parse(packageFile('package.json')) as { license: string }).license;
  const values = { NAME: CLAUDE_PLUGIN_NAME, DISPLAY_NAME: CLAUDE_PLUGIN_DISPLAY_NAME, VERSION: cliVersion, LICENSE: license, MARKETPLACE: PLUGIN_MARKETPLACE };
  const { skills, files } = skillFiles();
  const vendored = vendoredSkillFiles();
  const commands = Object.entries(PLUGIN_COMMANDS).map(([command, skill]) => `- \`/${CLAUDE_PLUGIN_NAME}:${command}\` opens \`${skill}\``);
  const tree = new Map([
    ['.claude-plugin/plugin.json', jsonDocument('claude-plugin.json', values)],
    ['README.md', fillPluginTemplate('README.md', { ...values, COMMANDS: commands.join('\n'), THIRD_PARTY: thirdPartyNames() })],
    ['LICENSE', packageFile('LICENSE')],
    ...files,
    ...vendored.files,
    ...commandFiles(renderMcpSkills()),
  ]);
  return finish('claude', CLAUDE_PLUGIN_NAME, cliVersion, [...skills, ...vendored.skills], tree, `${CLAUDE_PLUGIN_NAME}-claude.zip`);
}

/** The store's ChatGPT plugin, with its connector: refused for a store that declares no `mcp` block. */
export function buildChatgptPlugin(input: StorePluginInput): StorePlugin {
  const { config } = input;
  const baseUrl = config.serve?.base_url;
  if (config.mcp === undefined || baseUrl === undefined) throw new PluginWithoutMcpError();

  const origin = baseUrl.replace(/\/+$/, '');
  const mcpUrl = `${origin}/mcp`;
  const name = pluginName(input.storeName);
  const version = pluginVersion(input.cliVersion, input.commit);
  const displayName = `${input.storeName} (contexture)`;
  const values = { NAME: name, DISPLAY_NAME: displayName, VERSION: version, STORE_NAME: input.storeName, MCP_URL: mcpUrl, BASE_URL: origin };
  const { skills, files } = skillFiles();
  const vendored = vendoredSkillFiles();
  const tree = new Map([
    ['plugin.json', jsonDocument('chatgpt-plugin.json', values)],
    ['mcp.json', jsonDocument('chatgpt-mcp.json', values)],
    ['README.md', fillPluginTemplate('chatgpt-README.md', { ...values, THIRD_PARTY: thirdPartyNames() })],
    ...files,
    ...vendored.files,
  ]);
  return { ...finish('chatgpt', name, version, [...skills, ...vendored.skills], tree, `${name}-chatgpt.zip`), storeName: input.storeName, displayName, mcpUrl };
}

/**
 * publish-one-contexture-plugin D3 (harness-portability spec, *The committed
 * plugin is checked against the render*): the first path at which a plugin
 * directory on disk differs from a build, or null when every file matches
 * byte for byte and the directory holds nothing else.
 */
export async function firstDifference(plugin: BuiltPlugin, dir: string): Promise<string | null> {
  const onDisk = await listFiles(dir);
  const paths = [...new Set([...plugin.files.keys(), ...onDisk])].sort();
  for (const file of paths) {
    const wanted = plugin.files.get(file);
    if (wanted === undefined) return `${file}: on disk, but not in the build`;
    if (!onDisk.includes(file)) return `${file}: in the build, but missing on disk`;
    if (!(await readFile(path.join(dir, ...file.split('/')))).equals(Buffer.from(wanted, 'utf8'))) return `${file}: differs from the build`;
  }
  return null;
}

async function listFiles(dir: string, sub = ''): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(dir, sub), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * The store's name: its directory in the canonical clone, so a build run from
 * a session worktree names the store, not the worktree. A store below the
 * repository's root is named for its own directory.
 */
export async function storeNameFor(git: GitRunner, root: string): Promise<string> {
  const prefix = (await git.run(['rev-parse', '--show-prefix'], { cwd: root, allowFailure: true })).stdout.trim().replace(/\/+$/, '');
  if (prefix !== '') return path.posix.basename(prefix);
  const common = await git.run(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, allowFailure: true });
  const dir = common.exitCode === 0 ? common.stdout.trim() : '';
  return dir === '' ? path.basename(root) : path.basename(path.dirname(dir));
}

/** The commit a plugin renders from: the checkout's HEAD, or null before the first commit. */
export async function renderedCommit(git: GitRunner, root: string): Promise<string | null> {
  const head = await git.run(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: root, allowFailure: true });
  return head.exitCode === 0 && head.stdout.trim() !== '' ? head.stdout.trim() : null;
}
