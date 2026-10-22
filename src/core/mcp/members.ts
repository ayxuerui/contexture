import type { McpConfig } from '../../config/schema.js';
import { isDecider } from '../approval/decision.js';

/**
 * remote-access spec, *Scopes follow the configuration on every call*: a
 * verified email holds `read` when `mcp.readers` admits it and `capture` when
 * `mcp.capturers` does, matched by the same rule `change_approval.deciders`
 * is matched by — so an `@domain` entry admits that domain only.
 */
export const MCP_SCOPES = ['read', 'capture'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function scopesFor(email: string, mcp: McpConfig | undefined): McpScope[] {
  if (mcp === undefined) return [];
  const scopes: McpScope[] = [];
  if (isDecider(email, mcp.readers ?? [])) scopes.push('read');
  if (isDecider(email, mcp.capturers ?? [])) scopes.push('capture');
  return scopes;
}
