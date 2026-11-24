import type { McpConfig } from '../../config/schema.js';
import { isDecider } from '../approval/decision.js';

/**
 * remote-access spec, *Scopes follow the configuration on every call*: a
 * verified email holds `read` when `mcp.readers` admits it, `capture` when
 * `mcp.capturers` does and `edit` when `mcp.editors` does, matched by the same rule `change_approval.deciders`
 * is matched by — so an `@domain` entry admits that domain only.
 * `second-opinion` reaches the four second-opinion tools and no other.
 */
export const MCP_SCOPES = ['read', 'capture', 'edit', 'second-opinion'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function scopesFor(email: string, mcp: McpConfig | undefined): McpScope[] {
  if (mcp === undefined) return [];
  const scopes: McpScope[] = [];
  if (isDecider(email, mcp.readers ?? [])) scopes.push('read');
  if (isDecider(email, mcp.capturers ?? [])) scopes.push('capture');
  if (isDecider(email, mcp.editors ?? [])) scopes.push('edit');
  // offer-the-second-opinion-on-its-own D1: the store's list when it wrote one, an empty one included; else every reader.
  if (mcp.second_opinion === undefined ? scopes.includes('read') : isDecider(email, mcp.second_opinion)) scopes.push('second-opinion');
  return scopes;
}
