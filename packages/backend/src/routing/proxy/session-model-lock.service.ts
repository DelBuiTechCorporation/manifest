import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Tier, TIERS } from '../../scoring/types';
import type { ModelRoute } from 'manifest-shared';

interface LockEntry {
  route: ModelRoute;
  tier: Tier;
  agentId: string;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Per-session model lock for prompt-cache preservation.
 *
 * LLM providers (Anthropic, OpenAI) cache the prefix of a conversation to
 * reduce input-token costs. That cache is keyed by the exact model and
 * conversation prefix — switching to a different model mid-session busts it
 * and re-bills the full context.
 *
 * The routing scorer legitimately re-scores every turn, meaning a conversation
 * that starts "complex" may slip to "standard" or jump to "reasoning" based on
 * follow-up messages. Each tier transition potentially assigns a different
 * model, blowing the provider's prompt cache.
 *
 * This service locks the resolved route for a session once the first real
 * request succeeds. Subsequent requests in the same session reuse the locked
 * route as long as the freshly-scored tier stays within ±1 level. When the
 * tier diverges by ≥2 levels (e.g. simple → reasoning), the lock is cleared
 * and the new route is locked instead.
 *
 * The lock is agent-scoped: a session shared across multiple agents (rare in
 * practice) will clear and re-lock on the first mismatch.
 */
@Injectable()
export class SessionModelLockService implements OnModuleDestroy {
  private readonly locks = new Map<string, LockEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  private static readonly TIER_INDEX: Record<Tier, number> = {
    simple: 0,
    standard: 1,
    complex: 2,
    reasoning: 3,
  };

  constructor() {
    this.cleanupTimer = setInterval(() => this.evictStale(), CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Record the resolved route for the session.
   * No-op if a lock already exists for this session — the first resolution
   * wins.
   */
  tryLock(sessionKey: string, agentId: string, tier: Tier, route: ModelRoute | null): void {
    if (!route) return;
    if (this.locks.has(sessionKey)) return;
    this.locks.set(sessionKey, {
      route,
      tier,
      agentId,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  /**
   * Return the locked route if it is still valid for the given scored tier.
   *
   * Returns null when:
   * - No lock exists for the session
   * - The lock has expired
   * - The locked agentId differs (cross-agent session, rare)
   * - The scored tier diverges by ≥2 levels from the locked tier
   *
   * When a valid lock is returned, the lock TTL is refreshed.
   * When the tier diverges too far, the lock is cleared (the caller should
   * lock the new route with `tryLock`).
   */
  getLockedRoute(
    sessionKey: string,
    agentId: string,
    scoredTier: Tier,
  ): { route: ModelRoute; tier: Tier } | null {
    const entry = this.locks.get(sessionKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt || entry.agentId !== agentId) {
      this.locks.delete(sessionKey);
      return null;
    }

    const scoredIndex = SessionModelLockService.TIER_INDEX[scoredTier];
    const lockedIndex = SessionModelLockService.TIER_INDEX[entry.tier];
    if (Math.abs(scoredIndex - lockedIndex) >= 2) {
      this.locks.delete(sessionKey);
      return null;
    }

    // Refresh TTL on hit.
    entry.expiresAt = Date.now() + TTL_MS;
    return { route: entry.route, tier: entry.tier };
  }

  /** @internal Used for testing only. */
  clearSession(sessionKey: string): void {
    this.locks.delete(sessionKey);
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.locks) {
      if (now > entry.expiresAt) {
        this.locks.delete(key);
      }
    }
  }
}

// Re-export so callers can import from this file without reaching into scoring.
export type { Tier };
export { TIERS };
