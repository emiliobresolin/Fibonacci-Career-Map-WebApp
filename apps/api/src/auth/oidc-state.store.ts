import { Injectable, Logger } from '@nestjs/common';

/**
 * Server-side OIDC state store. The PKCE codeVerifier + nonce + state +
 * organizationId for an in-flight login are stashed here at /auth/oidc/init
 * and consumed (single-use) at /auth/oidc/callback. The web side only ever
 * sees the `state` token, never the verifier or nonce — that is the
 * difference between a real PKCE/CSRF anchor and a round-trip charade.
 *
 * In-process Map for now. Story 2-3 (Redis-backed session store) replaces
 * this with a Redis hash + TTL so the anchor survives a pod restart and
 * works across replicas. Until then the store is best-effort: a rolling
 * deploy or scale-out drops in-flight logins, which is acceptable in the
 * scaffold phase.
 */
@Injectable()
export class OidcStateStore {
  private readonly logger = new Logger(OidcStateStore.name);
  private readonly entries = new Map<string, StoredEntry>();
  /** Single-use TTL — IdP must come back within this window. */
  private readonly ttlMs = 10 * 60 * 1000;

  save(state: string, entry: Omit<StoredEntry, 'expiresAt'>): void {
    this.gc();
    this.entries.set(state, { ...entry, expiresAt: Date.now() + this.ttlMs });
  }

  /** Single-use lookup: returns the entry and removes it. */
  consume(state: string): StoredEntry | undefined {
    const entry = this.entries.get(state);
    if (!entry) return undefined;
    this.entries.delete(state);
    if (entry.expiresAt < Date.now()) {
      this.logger.warn(`OIDC state expired before callback (state=${state.slice(0, 8)}…)`);
      return undefined;
    }
    return entry;
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) this.entries.delete(key);
    }
  }
}

type StoredEntry = {
  codeVerifier: string;
  nonce: string;
  organizationId: string;
  organizationSlug: string;
  expiresAt: number;
};
