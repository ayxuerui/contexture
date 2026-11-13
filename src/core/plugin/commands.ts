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
