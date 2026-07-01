// PM-6 — Profit Model session save/load contract.
// Mirrors the response shape returned by `toPublicSession()` in
// `REMIBackend/src/services/tools/profit-model.service.ts`. The `inputs` blob
// is the engine's `ProfitModelInputs`; we re-export it here so consumers can
// import a single type without reaching into `@profit-model/types`.

import type { ProfitModelInputs } from "@profit-model/types";

export type { ProfitModelInputs };

export interface ProfitModelSession {
  id: number;
  share_token: string;
  name: string | null;
  inputs: ProfitModelInputs;
  outputs_snapshot: unknown;
  engine_version: string;
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
  accessed_at: string | null;
  expires_at: string | null;
}

export interface ProfitModelSessionListResponse {
  sessions: ProfitModelSession[];
  next_cursor: string | null;
}

export interface CreateAnonymousSessionPayload {
  inputs: ProfitModelInputs;
  name?: string | null;
  outputs_snapshot?: unknown;
}

export interface CreateAuthenticatedSessionPayload {
  inputs: ProfitModelInputs;
  name: string;
  outputs_snapshot?: unknown;
}

export interface UpdateSessionPayload {
  inputs?: ProfitModelInputs;
  name?: string | null;
  outputs_snapshot?: unknown;
}
