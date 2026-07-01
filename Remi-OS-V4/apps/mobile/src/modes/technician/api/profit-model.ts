// PM-6 — Profit Model save/load API client. Sits on top of `toolsApi()` so the
// shared 401-refresh + bearer-attach logic is reused. All five endpoints
// (anonymous create, authenticated create, get-by-token, list-mine, update,
// delete) live under `/api/v1/tools/profit-model/...` server-side.
//
// Auth semantics, copied from the backend so callers don't have to grep:
//   - createAnonymousSession  — no auth required, returns short-lived (90d) token
//   - createAuthenticatedSession — auth required, no expiry
//   - getSession              — no auth (share token IS the credential)
//   - listMySessions          — auth required
//   - updateSession           — auth required, owner-only (anonymous = 403)
//   - deleteSession           — owner OR holder of an anonymous share token

import { toolsApi } from "@technician/api/client";
import { ToolsEndpoints } from "@technician/api/endpoints";
import type {
  CreateAnonymousSessionPayload,
  CreateAuthenticatedSessionPayload,
  ProfitModelSession,
  ProfitModelSessionListResponse,
  UpdateSessionPayload,
} from "@technician/types/profit-model";

export async function createAnonymousSession(
  payload: CreateAnonymousSessionPayload
): Promise<ProfitModelSession> {
  return toolsApi<ProfitModelSession>(
    "post",
    ToolsEndpoints.profitModel.sessions,
    payload
  );
}

export async function createAuthenticatedSession(
  payload: CreateAuthenticatedSessionPayload
): Promise<ProfitModelSession> {
  return toolsApi<ProfitModelSession>(
    "post",
    ToolsEndpoints.profitModel.sessionsAuth,
    payload
  );
}

export async function getSession(shareToken: string): Promise<ProfitModelSession> {
  return toolsApi<ProfitModelSession>(
    "get",
    ToolsEndpoints.profitModel.session(shareToken)
  );
}

export async function listMySessions(opts?: {
  limit?: number;
  cursor?: string | null;
}): Promise<ProfitModelSessionListResponse> {
  return toolsApi<ProfitModelSessionListResponse>(
    "get",
    ToolsEndpoints.profitModel.sessions,
    {
      limit: opts?.limit,
      cursor: opts?.cursor ?? undefined,
    }
  );
}

export async function updateSession(
  shareToken: string,
  patch: UpdateSessionPayload
): Promise<ProfitModelSession> {
  return toolsApi<ProfitModelSession>(
    "put",
    ToolsEndpoints.profitModel.session(shareToken),
    patch
  );
}

export async function deleteSession(shareToken: string): Promise<void> {
  await toolsApi<null>(
    "delete",
    ToolsEndpoints.profitModel.session(shareToken)
  );
}

export const profitModelApi = {
  createAnonymousSession,
  createAuthenticatedSession,
  getSession,
  listMySessions,
  updateSession,
  deleteSession,
};
