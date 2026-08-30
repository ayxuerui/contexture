/**
 * The interactive-selection seam. No command or core module imports
 * @inquirer/prompts directly — they depend on this interface, so a fake
 * prompter can prove deterministic facts (which choices were offered, in
 * what order, with what descriptions) without a real terminal.
 */
export interface ProfileChoice {
  id: string;
  name: string;
  description: string;
}

export interface Prompter {
  /**
   * Presents `choices` and returns the selected id. Implementations MUST
   * render entirely to stderr — never stdout, so no invocation mode can let
   * prompt text corrupt a --json payload.
   */
  selectProfile(input: {
    message: string;
    choices: readonly ProfileChoice[];
    defaultId: string;
  }): Promise<string>;

  /**
   * session-submit-and-land spec: the fire gate before an external side
   * effect (a merge, a worktree removal) — `false` means the operator
   * declined and nothing happens. Implementations MUST render entirely to
   * stderr, for the same --json-corruption reason as `selectProfile`.
   */
  confirm(input: { message: string }): Promise<boolean>;
}
