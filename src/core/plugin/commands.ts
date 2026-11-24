/**
 * publish-one-contexture-plugin D5 (harness-portability spec, *The plugin's
 * commands open its skills*): the plugin's typed commands, each mapped by
 * name to the skill it opens. Declared here, never derived from a skill's
 * name, so `/contexture:session` can open `ctxr-session-lifecycle` and a skill
 * without a command stays without one.
 */
export const PLUGIN_COMMANDS: Readonly<Record<string, string>> = {
  capture: 'ctxr-capture',
  ingest: 'ctxr-ingest-orchestration',
  research: 'ctxr-research',
  rollup: 'ctxr-rollup',
  mission: 'ctxr-mission',
  session: 'ctxr-session-lifecycle',
  submit: 'ctxr-submit',
  // serve-the-second-opinion-to-chat-apps: the skill drives `ctxr second-opinion`, so the command takes its name.
  'second-opinion': 'ctxr-second-opinion',
  // publish-through-the-plugin D5: a page is something a member asks for by name.
  publish: 'ctxr-publish',
};

/** Each command whose skill the plugin does not carry, named with the skill it asks for. */
export function commandMapProblems(commands: Readonly<Record<string, string>>, carried: readonly string[]): string[] {
  return Object.entries(commands)
    .filter(([, skill]) => !carried.includes(skill))
    .map(([command, skill]) => `command ${command} opens ${skill}, which the plugin does not carry`);
}

/**
 * offer-the-second-opinion-on-its-own D6 (harness-portability spec,
 * *contexture publishes a plugin that carries only the second opinion*): one
 * declared plugin. The builder writes each Claude plugin from its definition,
 * and nothing about a plugin is derived from another's.
 */
export interface PluginDefinition {
  /** The plugin's name: its directory under `plugins/`, its marketplace entry and its commands' namespace. */
  name: string;
  displayName: string;
  /** The shared skills it carries, by folder. Null carries every one. */
  skills: readonly string[] | null;
  /** Each typed command, mapped by name to the skill it opens. */
  commands: Readonly<Record<string, string>>;
  /** Whether it carries the default craft skills, which page-making delegates to, with their licenses. */
  vendored: boolean;
  /** `templates/plugin/` files: the Claude manifest and README, and the ChatGPT manifest and README. */
  templates: { manifest: string; readme: string; chatgptManifest: string; chatgptReadme: string };
  /** The ChatGPT plugin's name for a store or server, from the slug of its name. */
  chatgptName(slug: string): string;
}

export const CONTEXTURE_PLUGIN: PluginDefinition = {
  name: 'contexture',
  displayName: 'contexture',
  skills: null,
  commands: PLUGIN_COMMANDS,
  vendored: true,
  templates: { manifest: 'claude-plugin.json', readme: 'README.md', chatgptManifest: 'chatgpt-plugin.json', chatgptReadme: 'chatgpt-README.md' },
  chatgptName: (slug) => `contexture-${slug}`,
};

/** The one skill the `second-opinion` plugin carries. */
export const SECOND_OPINION_SKILL = 'ctxr-second-opinion';

/**
 * D6: for a person with no store. One skill and one command, `ask`, so
 * `/second-opinion:ask` opens the skill: `/second-opinion:second-opinion`
 * repeats itself, and `critique` would misname a poll.
 */
export const SECOND_OPINION_PLUGIN: PluginDefinition = {
  name: 'second-opinion',
  displayName: 'second opinion',
  skills: [SECOND_OPINION_SKILL],
  commands: { ask: SECOND_OPINION_SKILL },
  vendored: false,
  templates: {
    manifest: 'second-opinion-plugin.json',
    readme: 'second-opinion-README.md',
    chatgptManifest: 'second-opinion-chatgpt-plugin.json',
    chatgptReadme: 'second-opinion-chatgpt-README.md',
  },
  chatgptName: (slug) => `second-opinion-${slug}`,
};

/** Every Claude plugin `ctxr plugin build` writes and the marketplace lists, in that order. */
export const PLUGIN_DEFINITIONS: readonly PluginDefinition[] = [CONTEXTURE_PLUGIN, SECOND_OPINION_PLUGIN];

/** Each problem in a list of definitions, named with its plugin: a command whose skill the plugin does not carry, or a skill nothing renders. */
export function definitionProblems(definitions: readonly PluginDefinition[], rendered: readonly string[]): string[] {
  return definitions.flatMap((definition) => {
    const carried = definition.skills ?? rendered;
    return [
      ...carried.filter((skill) => !rendered.includes(skill)).map((skill) => `plugin ${definition.name}: carries ${skill}, which is not a shared skill`),
      ...commandMapProblems(definition.commands, carried).map((problem) => `plugin ${definition.name}: ${problem}`),
    ];
  });
}
