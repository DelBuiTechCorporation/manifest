import { SessionModelLockService } from '../session-model-lock.service';
import { RoutingCacheService } from '../../routing-core/routing-cache.service';
import type { ModelRoute } from 'manifest-shared';

function makeRoute(model: string, provider = 'anthropic'): ModelRoute {
  return { model, provider, authType: 'api_key' } as ModelRoute;
}

describe('SessionModelLockService', () => {
  let svc: SessionModelLockService;
  let routingCache: RoutingCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    routingCache = new RoutingCacheService();
    svc = new SessionModelLockService(routingCache);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('tryLock', () => {
    it('locks the route on first call', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      const result = svc.getLockedRoute('sess-1', 'agent-1', 'complex');
      expect(result?.route.model).toBe('claude-sonnet-4.5');
      expect(result?.tier).toBe('complex');
    });

    it('does not overwrite an existing lock', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      svc.tryLock('sess-1', 'agent-1', 'standard', makeRoute('gpt-4o'));
      const result = svc.getLockedRoute('sess-1', 'agent-1', 'complex');
      expect(result?.route.model).toBe('claude-sonnet-4.5');
    });

    it('is a no-op when route is null', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', null);
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).toBeNull();
    });
  });

  describe('getLockedRoute', () => {
    it('returns null when no lock exists', () => {
      expect(svc.getLockedRoute('no-session', 'agent-1', 'standard')).toBeNull();
    });

    it('returns the lock when scored tier is the same as locked tier', () => {
      svc.tryLock('sess-1', 'agent-1', 'standard', makeRoute('gpt-4o'));
      const result = svc.getLockedRoute('sess-1', 'agent-1', 'standard');
      expect(result).not.toBeNull();
      expect(result!.route.model).toBe('gpt-4o');
    });

    it('returns the lock when scored tier is 1 level above the locked tier', () => {
      svc.tryLock('sess-1', 'agent-1', 'simple', makeRoute('claude-haiku'));
      const result = svc.getLockedRoute('sess-1', 'agent-1', 'standard');
      expect(result?.route.model).toBe('claude-haiku');
    });

    it('returns the lock when scored tier is 1 level below the locked tier', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      const result = svc.getLockedRoute('sess-1', 'agent-1', 'standard');
      expect(result?.route.model).toBe('claude-sonnet-4.5');
    });

    it('clears the lock when scored tier is 2+ levels above', () => {
      svc.tryLock('sess-1', 'agent-1', 'simple', makeRoute('claude-haiku'));
      // simple(0) vs complex(2): diverges by 2 → lock cleared
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).toBeNull();
      // Lock is gone after clearance.
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')?.route.model).toBe(
        'claude-sonnet-4.5',
      );
    });

    it('clears the lock when scored tier is 2+ levels below', () => {
      svc.tryLock('sess-1', 'agent-1', 'reasoning', makeRoute('o3'));
      // reasoning(3) vs standard(1): diverges by 2 → lock cleared
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'standard')).toBeNull();
    });

    it('clears the lock when scored tier jumps the full range (simple → reasoning)', () => {
      svc.tryLock('sess-1', 'agent-1', 'simple', makeRoute('haiku'));
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'reasoning')).toBeNull();
    });

    it('clears the lock when agentId differs', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      const result = svc.getLockedRoute('sess-1', 'agent-2', 'complex');
      expect(result).toBeNull();
    });

    it('returns null and clears on TTL expiry', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      jest.advanceTimersByTime(31 * 60 * 1000); // 31 minutes
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).toBeNull();
    });

    it('refreshes the TTL on a successful hit', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      jest.advanceTimersByTime(25 * 60 * 1000); // 25 min — still valid
      svc.getLockedRoute('sess-1', 'agent-1', 'complex'); // hit → refresh
      jest.advanceTimersByTime(25 * 60 * 1000); // 25 min more — total 50 min but refreshed
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).not.toBeNull();
    });

    it('does not affect a different session key', () => {
      svc.tryLock('sess-A', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      expect(svc.getLockedRoute('sess-B', 'agent-1', 'complex')).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('clears the lock for the specified session', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      svc.clearSession('sess-1');
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).toBeNull();
    });

    it('does not affect other sessions', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      svc.tryLock('sess-2', 'agent-1', 'standard', makeRoute('gpt-4o'));
      svc.clearSession('sess-1');
      expect(svc.getLockedRoute('sess-2', 'agent-1', 'standard')).not.toBeNull();
    });
  });

  describe('stale eviction via cleanup timer', () => {
    it('evicts expired entries on cleanup interval', () => {
      svc.tryLock('sess-old', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      jest.advanceTimersByTime(31 * 60 * 1000); // expire the entry
      jest.advanceTimersByTime(5 * 60 * 1000); // trigger cleanup interval
      // Entry is evicted — tryLock should now succeed.
      svc.tryLock('sess-old', 'agent-1', 'standard', makeRoute('gpt-4o'));
      expect(svc.getLockedRoute('sess-old', 'agent-1', 'standard')?.route.model).toBe('gpt-4o');
    });
  });

  describe('clearAgent', () => {
    it('drops every lock held for the agent but leaves other agents alone', () => {
      svc.tryLock('sess-1', 'agent-1', 'complex', makeRoute('claude-sonnet-4.5'));
      svc.tryLock('sess-2', 'agent-1', 'standard', makeRoute('gpt-4o'));
      svc.tryLock('sess-3', 'agent-2', 'standard', makeRoute('gpt-4o'));

      svc.clearAgent('agent-1');

      expect(svc.getLockedRoute('sess-1', 'agent-1', 'complex')).toBeNull();
      expect(svc.getLockedRoute('sess-2', 'agent-1', 'standard')).toBeNull();
      // A different agent's lock is untouched.
      expect(svc.getLockedRoute('sess-3', 'agent-2', 'standard')).not.toBeNull();
    });

    it('is invoked when the agent routing cache is invalidated, so a config change frees the lock', () => {
      svc.tryLock('sess-1', 'agent-1', 'standard', makeRoute('gpt-4o'));
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'standard')).not.toBeNull();

      // Simulate a routing-config change (tier swap, provider toggle, …).
      routingCache.invalidateAgent('agent-1');

      // The previously locked route is gone — next request resolves fresh.
      expect(svc.getLockedRoute('sess-1', 'agent-1', 'standard')).toBeNull();
    });
  });
});
