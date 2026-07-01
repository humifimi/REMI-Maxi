/**
 * Tests for `useRealtimeCustomerReorganization` (P6-CU-1, CU-G5).
 *
 * Two halves and one regression that drops EITHER half still passes a
 * test that only asserts the other, so each event kind is exercised
 * for both the inbox-list invalidation AND the per-session-detail
 * invalidation independently. The appointments-list invalidation is
 * exercised once because it's only relevant for `session_committed`.
 *
 * The WS layer is not exercised directly. We drive the pure event
 * router (`handleCustomerReorganizationEvent`) — this is the same code
 * path `useRealtimeChannel` invokes via `onMessage`, so a passing
 * dispatch test covers the wiring through the hook (which is itself a
 * thin shell of `useMemo`/`useCallback` over the router +
 * `useRealtimeChannel`).
 *
 * The wiring half (channel string derivation, no-op when logged out,
 * defensive guard against malformed payloads) is covered separately
 * via `renderHook` with a mocked `useRealtimeChannel`.
 */

import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAuthStore } from '@/src/stores/auth';
import { reorganizationKeys } from '@customer/hooks/reorganizations/use-pending-sessions';
import { reorganizationDetailKeys } from '@customer/hooks/reorganizations/use-session-detail';
import { UserRole } from '@customer/types/enums';

import {
  KNOWN_CUSTOMER_REORG_EVENTS,
  type CustomerReorganizationRealtimeEvent,
  handleCustomerReorganizationEvent,
  useRealtimeCustomerReorganization,
} from '../use-realtime-customer-reorganization';

// `useRealtimeChannel` opens a real WS at module load time of any
// consumer that mounts it. Mock it so the wiring-half test can assert
// what `channel` / `onMessage` it received without spinning up a fake
// server.
const mockUseRealtimeChannel = jest.fn();
jest.mock('../use-realtime-channel', () => ({
  __esModule: true,
  useRealtimeChannel: (opts: unknown) => mockUseRealtimeChannel(opts),
}));

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION_ID = 4242;

function buildEvent(
  event: string,
  sessionId: number = SESSION_ID,
): CustomerReorganizationRealtimeEvent {
  return {
    event,
    session_id: sessionId,
    session_summary: {
      id: sessionId,
      source: 'tech_app',
      status: 'pending_review',
      intent_count: 1,
    },
  };
}

function spyOnInvalidations(client: QueryClient) {
  return jest.spyOn(client, 'invalidateQueries');
}

function findInvalidationFor(
  spy: jest.SpyInstance,
  predicate: (key: readonly unknown[]) => boolean,
): boolean {
  return spy.mock.calls.some((call) => {
    const filter = call[0] as { queryKey?: readonly unknown[] } | undefined;
    return Array.isArray(filter?.queryKey) && predicate(filter!.queryKey!);
  });
}

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  if (key.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
}

// ── Suite ───────────────────────────────────────────────────────────

describe('useRealtimeCustomerReorganization — handleCustomerReorganizationEvent (event router)', () => {
  let queryClient: QueryClient;
  let invalidateSpy: jest.SpyInstance;

  beforeEach(() => {
    queryClient = new QueryClient();
    invalidateSpy = spyOnInvalidations(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  // ── Cache-invalidation half ─────────────────────────────────────

  describe('inbox + Home-tab badge invalidation', () => {
    // The chunk-prompt-named "session_pending_for_customer" maps to
    // the actual BE event `session_finalized` — see PLAN-DEVIATION
    // `2026-05-02-customer-realtime-event-shape`.
    it.each(KNOWN_CUSTOMER_REORG_EVENTS)(
      '%s → invalidates reorganizationKeys.all (inbox + badge)',
      (eventKind) => {
        handleCustomerReorganizationEvent(buildEvent(eventKind), queryClient);
        expect(
          findInvalidationFor(invalidateSpy, (k) =>
            startsWith(k, reorganizationKeys.all),
          ),
        ).toBe(true);
      },
    );
  });

  describe('per-session detail invalidation', () => {
    // `session_created` is the only known event that intentionally
    // does NOT invalidate the per-session detail key — until
    // status=`pending_review` no detail-screen consumer has the
    // session id queued anyway, and the broad
    // `reorganizationKeys.all` invalidation already covers the badge.
    it.each(
      KNOWN_CUSTOMER_REORG_EVENTS.filter((e) => e !== 'session_created'),
    )('%s → also invalidates reorganizationDetailKeys.detail(sessionId)', (eventKind) => {
      handleCustomerReorganizationEvent(buildEvent(eventKind), queryClient);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationDetailKeys.detail(SESSION_ID)),
        ),
      ).toBe(true);
    });

    it('session_created does NOT invalidate per-session detail (cache stays warm via inbox refetch)', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_created'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationDetailKeys.detail(SESSION_ID)),
        ),
      ).toBe(false);
    });
  });

  describe('appointments-list invalidation', () => {
    // Only `session_committed` actually changes the customer-visible
    // appointment list (atomic apply succeeded). All other events are
    // session-state-only — appointments are unchanged, so we save the
    // network round-trip.
    it('session_committed → invalidates [appointments]', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_committed'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(true);
    });

    it.each(
      KNOWN_CUSTOMER_REORG_EVENTS.filter((e) => e !== 'session_committed'),
    )('%s does NOT invalidate [appointments]', (eventKind) => {
      handleCustomerReorganizationEvent(buildEvent(eventKind), queryClient);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(false);
    });
  });

  describe('full per-event invalidation set (chunk-prompt mapping locked)', () => {
    // The chunk-prompt-named events map to actual BE events as
    // documented in PLAN-DEVIATION `2026-05-02-customer-realtime-event-shape`.
    // Each test below pins one chunk-prompt branch to the actual
    // invalidation set so a future agent can't silently re-fabricate
    // the wrong mapping.

    it('session_finalized (≡ "session_pending_for_customer") → inbox + detail, NO appointments', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_finalized'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationKeys.all),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationDetailKeys.detail(SESSION_ID)),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(false);
    });

    it('session_committed → inbox + detail + appointments (full triple)', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_committed'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationKeys.all),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationDetailKeys.detail(SESSION_ID)),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(true);
    });

    it('session_failed → inbox + detail, NO appointments (world unchanged)', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_failed'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationKeys.all),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationDetailKeys.detail(SESSION_ID)),
        ),
      ).toBe(true);
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(false);
    });
  });

  describe('unknown events', () => {
    it('unknown event → conservative inbox invalidation (fail-soft per §6.6.4)', () => {
      handleCustomerReorganizationEvent(
        buildEvent('session_updated_someday'),
        queryClient,
      );
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationKeys.all),
        ),
      ).toBe(true);
      // Unknown events deliberately do NOT invalidate the per-
      // session detail or the appointments list — those are reserved
      // for the known events whose semantics we've reasoned about.
      expect(
        findInvalidationFor(invalidateSpy, (k) => startsWith(k, ['appointments'])),
      ).toBe(false);
    });
  });

  describe('KNOWN_CUSTOMER_REORG_EVENTS coverage tripwire', () => {
    it('matches the BE-emitted set so a future agent extending the BE can\'t silently miss the FE side', () => {
      // The constant is the FE's view of what the BE emits today.
      // If a new value is added BE-side (master plan §6.6.3 calls
      // out the `reorganization_audit_action` enum as the source of
      // truth), this assertion fails until a corresponding FE
      // dispatch case is added.
      expect(KNOWN_CUSTOMER_REORG_EVENTS).toEqual([
        'session_created',
        'session_finalized',
        'session_committed',
        'session_failed',
        'session_cancelled',
        'authorization_granted',
        'authorization_denied',
        'session_expired',
      ]);
    });
  });

  describe('payload defensiveness', () => {
    it('missing session_summary → still dispatches (only event + session_id are required)', () => {
      const event: CustomerReorganizationRealtimeEvent = {
        event: 'session_finalized',
        session_id: 12,
      };
      expect(() =>
        handleCustomerReorganizationEvent(event, queryClient),
      ).not.toThrow();
      expect(
        findInvalidationFor(invalidateSpy, (k) =>
          startsWith(k, reorganizationKeys.all),
        ),
      ).toBe(true);
    });
  });
});

// ── Wiring half (channel derivation + onMessage forwarding) ────────

describe('useRealtimeCustomerReorganization — wiring', () => {
  beforeEach(() => {
    mockUseRealtimeChannel.mockReset();
    mockUseRealtimeChannel.mockReturnValue({ connected: false });
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isHydrated: true,
      biometricRequired: false,
    });
  });

  function renderUseRealtimeCustomerReorganization() {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    return renderHook(() => useRealtimeCustomerReorganization(), { wrapper });
  }

  it('passes channel=null when the user is not authenticated', () => {
    renderUseRealtimeCustomerReorganization();
    expect(mockUseRealtimeChannel).toHaveBeenCalled();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBeNull();
  });

  it('passes channel=null when authenticated but no userId on JWT', () => {
    // Edge case: store says authenticated but `user` row is missing
    // (cold-start race, profile fetch failure). Don't subscribe to a
    // channel like `customer:undefined:reorganization`.
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: null,
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeCustomerReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBeNull();
  });

  it('subscribes to customer:{userId}:reorganization once authenticated with a userId', () => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: {
        userId: 200,
        email: 'c@b.com',
        role: UserRole.CUSTOMER,
        fullName: 'Customer Two Hundred',
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeCustomerReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    expect(lastCall?.[0]?.channel).toBe('customer:200:reorganization');
    expect(typeof lastCall?.[0]?.onMessage).toBe('function');
  });

  it('forwards a valid event payload through to handleCustomerReorganizationEvent', () => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: {
        userId: 200,
        email: 'c@b.com',
        role: UserRole.CUSTOMER,
        fullName: 'Customer Two Hundred',
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    // Use a fresh client so we can spy on it directly.
    const client = new QueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    renderHook(() => useRealtimeCustomerReorganization(), { wrapper });

    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    const onMessage = lastCall?.[0]?.onMessage as (p: unknown) => void;

    onMessage({
      event: 'session_committed',
      session_id: 555,
      session_summary: { id: 555, source: 'tech_app', status: 'committed', intent_count: 1 },
    });

    // session_committed → full triple invalidation, including appointments.
    expect(
      invalidateSpy.mock.calls.some((c) => {
        const k = (c[0] as { queryKey?: readonly unknown[] }).queryKey;
        return Array.isArray(k) && startsWith(k, ['appointments']);
      }),
    ).toBe(true);
  });

  it('ignores non-reorganization payloads passed to onMessage (defensive guard)', () => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: {
        userId: 200,
        email: 'c@b.com',
        role: UserRole.CUSTOMER,
        fullName: 'Customer Two Hundred',
      },
      isAuthenticated: true,
      isHydrated: true,
      biometricRequired: false,
    });

    renderUseRealtimeCustomerReorganization();
    const lastCall = mockUseRealtimeChannel.mock.calls.at(-1);
    const onMessage = lastCall?.[0]?.onMessage as (p: unknown) => void;

    expect(() => onMessage(null)).not.toThrow();
    expect(() => onMessage(undefined)).not.toThrow();
    expect(() => onMessage({ event: 123, session_id: 'wrong' })).not.toThrow();
    expect(() => onMessage({ random: 'shape' })).not.toThrow();
  });
});
