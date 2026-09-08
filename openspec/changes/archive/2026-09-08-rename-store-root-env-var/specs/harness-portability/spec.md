## MODIFIED Requirements

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the `CONTEXTURE_STORE_ROOT` environment variable; walking up from the current working directory looking for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root was found, and SHALL NOT guess a fallback location.

#### Scenario: Explicit argument overrides an inherited environment variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_STORE_ROOT=/path/b` is set in the environment
- **THEN** the command operates against `/path/a`

#### Scenario: No root resolves
- **WHEN** a command is invoked with no `--root`, no `CONTEXTURE_STORE_ROOT`, and no `contexture.yaml` found by walking up from the current directory
- **THEN** the command exits non-zero with a message naming that no store root was found, and performs no store operation

### Requirement: Exactly one root environment variable and one root flag
The store root SHALL be addressable by exactly one environment variable and one command-line flag. No alias environment variable or flag name SHALL be introduced for the same purpose.

A superseded root variable name SHALL NOT resolve a root under any circumstances. When a superseded name is set and the current one is not, the command SHALL exit non-zero naming both names, enforced by a check in root resolution that precedes every store operation — so that an environment migrated only in part fails visibly rather than resolving a different store by walking up from the current directory.

#### Scenario: No alias is recognized
- **WHEN** an operator sets an environment variable that is neither the documented root variable nor a superseded root variable name, intending it to select the store root
- **THEN** contexture does not recognize it and falls through to the next resolution step

#### Scenario: A superseded variable name is refused rather than ignored
- **WHEN** a command is invoked with no `--root`, with `CONTEXTURE_ROOT` set in the environment, and with `CONTEXTURE_STORE_ROOT` unset
- **THEN** the command exits non-zero with a message naming both the superseded and the current variable, performs no store operation, and does not fall through to walking up from the current directory

#### Scenario: The current variable wins when both are set
- **WHEN** a command is invoked with no `--root` while both `CONTEXTURE_ROOT` and `CONTEXTURE_STORE_ROOT` are set to different paths
- **THEN** the command operates against the path named by `CONTEXTURE_STORE_ROOT` and does not refuse

#### Scenario: An explicit argument beats a superseded variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_ROOT=/path/b` is set and `CONTEXTURE_STORE_ROOT` is unset
- **THEN** the command operates against `/path/a` and does not refuse, since no environment variable was consulted to resolve the root
