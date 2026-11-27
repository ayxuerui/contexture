import type { IncomingMessage } from 'node:http';
import { createIdentityVerifier, type IdentityVerifier } from '../approval/identity.js';
import type { ChangeApprovalConfig, StoreConfig } from '../../config/schema.js';

/**
 * context-browsing spec ("A widened bind admits only verified requests when
 * the store declares an identity"; serve-browsing-requires-identity): when the
 * store declares `change_approval` and `ctxr serve` is bound wider than
 * loopback, a request must carry the access proxy's verified assertion before
 * any route reads the store. A request that reached the port around the proxy
 * carries none.
 *
 * The gate admits or refuses; it filters nothing by requester, and consults no
 * list (design.md D2). It keeps a verifier of its own, built from the loaded
 * configuration, so it does not depend on whether the approval surface could
 * be built (D5).
 */
export type GateVerdict = { admitted: true } | { admitted: false; reason: string };

export const GATE_REFUSAL = 'a verified identity assertion is required\n';

/** `127.0.0.0/8`, `::1`, or an IPv4-mapped loopback address: the bind a person reading their own store uses (D3). */
export function isLoopbackAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::1') return true;
  const v4 = lower.startsWith('::ffff:') ? lower.slice('::ffff:'.length) : lower;
  return /^127(\.\d{1,3}){3}$/.test(v4);
}

export class IdentityGate {
  private built: { key: string; verifier: IdentityVerifier } | null = null;

  /**
   * `boundToLoopback` is asked per request, because the address is known only
   * once the listener is bound. `makeVerifier` is the seam for tests.
   */
  constructor(
    private readonly boundToLoopback: () => boolean,
    private readonly makeVerifier: (identity: ChangeApprovalConfig['identity']) => IdentityVerifier = (identity) => createIdentityVerifier(identity),
  ) {}

  private verifierFor(identity: ChangeApprovalConfig['identity']): IdentityVerifier {
    const key = JSON.stringify(identity);
    if (this.built?.key !== key) this.built = { key, verifier: this.makeVerifier(identity) };
    return this.built.verifier;
  }

  async check(config: StoreConfig, req: Pick<IncomingMessage, 'headers'>): Promise<GateVerdict> {
    const identity = config.change_approval?.identity;
    if (identity === undefined || this.boundToLoopback()) return { admitted: true };
    const verified = await this.verifierFor(identity).verify(req.headers[identity.header.toLowerCase()]);
    return verified.ok ? { admitted: true } : { admitted: false, reason: verified.reason };
  }
}
