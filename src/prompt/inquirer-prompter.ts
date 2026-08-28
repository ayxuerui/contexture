import { select } from '@inquirer/prompts';
import type { Prompter } from './prompter.js';

/**
 * The real prompter. Renders entirely to stderr via @inquirer/prompts'
 * `output` context option — never stdout, so no invocation mode can let
 * prompt text corrupt a --json payload.
 *
 * Each choice's name embeds its description directly (rather than relying on
 * @inquirer's "description of the currently-highlighted item" feature),
 * because store-lifecycle's spec requires every shipped profile's name AND
 * description to be presented together, not revealed one at a time as the
 * operator moves the cursor.
 */
export function createInquirerPrompter(): Prompter {
  return {
    async selectProfile(input) {
      return select(
        {
          message: input.message,
          default: input.defaultId,
          choices: input.choices.map((c) => ({
            name: `${c.name} — ${c.description}`,
            value: c.id,
          })),
        },
        { output: process.stderr },
      );
    },
  };
}
