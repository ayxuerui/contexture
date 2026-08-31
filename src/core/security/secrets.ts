/**
 * write-lifecycle spec: pre-commit runs "a secret-pattern scan." A modest,
 * documented set of high-confidence patterns — this is a safety net behind
 * PR review, not a substitute for it (design.md: review is the layer that
 * doesn't depend on hook cooperation).
 */
export interface SecretPattern {
  id: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { id: 'aws_access_key_id', regex: /AKIA[0-9A-Z]{16}/g },
  { id: 'private_key_block', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: 'github_token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { id: 'slack_token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'generic_api_key', regex: /sk-[A-Za-z0-9]{20,}/g },
];

export interface SecretMatch {
  patternId: string;
  line: number;
}

export function scanForSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        matches.push({ patternId: pattern.id, line: index + 1 });
      }
    }
  });
  return matches;
}
