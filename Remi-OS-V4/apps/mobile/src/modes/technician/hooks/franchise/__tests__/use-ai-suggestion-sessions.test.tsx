/**
 * Tests for `useAiSuggestionSessions` demo-mode gating (2026-05-08).
 *
 * The hook returns AI-source `pending_review` reorganization sessions
 * to the FO-side AI tab. After the 2026-05-08 fix that turned demo
 * mode off by default, the hook MUST short-circuit when
 * `Config.DEMO_MODE === false`:
 *
 *   1. The underlying `useQuery` MUST be disabled (no network request).
 *   2. The `data` field MUST be `undefined` (not the BE-returned list).
 *
 * Flipping `Config.DEMO_MODE` back to `true` (e.g., for a customer
 * pitch) MUST restore the previous behavior:
 *
 *   3. The query fires.
 *   4. The returned `data` is the AI-filtered subset of the BE
 *      response.
 *
 * The ungated underlying hook (`useFranchiseReorganizationSessions`)
 * is exercised separately by the consumers that need it; only the
 * AI-suggestion gating contract belongs in this file.
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useAiSuggestionSessions } from "../use-franchise-reorganizations";
import { Config } from "@technician/constants/config";

// ── Module mocks ────────────────────────────────────────────────────

const mockFranchiseApi = jest.fn();
jest.mock("@technician/api/client", () => ({
  __esModule: true,
  franchiseApi: (...args: unknown[]) => mockFranchiseApi(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 0, retryDelay: 0 },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { Wrapper, queryClient };
}

const AI_SESSION = {
  id: 9001,
  source: "ai_suggestion",
  status: "pending_review",
  intents: [],
};

const NON_AI_SESSION = {
  id: 9002,
  source: "tech_app",
  status: "pending_review",
  intents: [],
};

// ── Suite ───────────────────────────────────────────────────────────

describe("useAiSuggestionSessions — DEMO_MODE gate (2026-05-08)", () => {
  let originalDemoMode: boolean;

  beforeEach(() => {
    mockFranchiseApi.mockReset();
    originalDemoMode = Config.DEMO_MODE;
  });

  afterEach(() => {
    // Config is `as const` so direct assignment is type-rejected;
    // cast to mutable for the test override and restore in `afterEach`.
    (Config as { DEMO_MODE: boolean }).DEMO_MODE = originalDemoMode;
  });

  function setDemoMode(value: boolean) {
    (Config as { DEMO_MODE: boolean }).DEMO_MODE = value;
  }

  it("returns empty/disabled when DEMO_MODE === false (default after 2026-05-08)", async () => {
    setDemoMode(false);

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useAiSuggestionSessions(), {
      wrapper: Wrapper,
    });

    // Allow any queued microtasks to drain so a misfiring query has
    // time to call the API mock.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFranchiseApi).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    // Disabled queries land at `isPending: true` + `fetchStatus: idle`.
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("respects the caller-supplied `enabled: false` regardless of DEMO_MODE", async () => {
    setDemoMode(true);

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(
      () => useAiSuggestionSessions({ enabled: false }),
      { wrapper: Wrapper },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockFranchiseApi).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("flipping DEMO_MODE to true restores fetch + AI-only filter", async () => {
    setDemoMode(true);

    mockFranchiseApi.mockResolvedValueOnce({
      sessions: [AI_SESSION, NON_AI_SESSION, AI_SESSION],
    });

    const { Wrapper } = buildWrapper();
    const { result } = renderHook(() => useAiSuggestionSessions(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(mockFranchiseApi).toHaveBeenCalledTimes(1);
    // Two AI sessions, the non-AI one is filtered out.
    expect(result.current.data).toHaveLength(2);
    expect(
      result.current.data?.every((s) => s.source === "ai_suggestion"),
    ).toBe(true);
  });
});
