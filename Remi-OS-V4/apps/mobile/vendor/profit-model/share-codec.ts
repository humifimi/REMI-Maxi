// Part of the REMI profit-model engine.
// URL state encode/decode per spec §7.
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

import type { ProfitModelInputs } from './types';

/** Codec version. Bump on any breaking change to ProfitModelInputs shape. */
export const CODEC_VERSION = 3;

interface VersionedEnvelope {
  v: number;
  data: ProfitModelInputs;
}

// Base64URL helpers — Node + Next.js (server) + browser all expose Buffer
// (Next polyfills it; React Native callers should use a polyfill at the call
// site, e.g. `react-native-quick-base64`). We deliberately skip compression
// in v2 to keep the engine zero-runtime-deps; URLs sit at 1–2 KB.
function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(s: string): string {
  // Restore `=` padding and standard `+` / `/` chars before base64 decoding.
  let normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad === 2) normalized += '==';
  else if (pad === 3) normalized += '=';
  else if (pad === 1) {
    // Invalid base64url string (length ≡ 1 mod 4 is impossible).
    throw new Error('invalid base64url length');
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

/** Encode the inputs object to a URL-safe string. */
export function encode(inputs: ProfitModelInputs): string {
  const envelope: VersionedEnvelope = { v: CODEC_VERSION, data: inputs };
  const json = JSON.stringify(envelope);
  return base64UrlEncode(json);
}

/**
 * Decode a previously-encoded share string. Returns null on:
 *  - malformed input (not base64url, not JSON, missing fields)
 *  - unknown version (older sites may have shared a non-versioned link;
 *    we don't try to migrate)
 */
export function decode(encoded: string): ProfitModelInputs | null {
  if (typeof encoded !== 'string' || encoded.length === 0) return null;
  let json: string;
  try {
    json = base64UrlDecode(encoded);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('v' in (parsed as Record<string, unknown>)) ||
    !('data' in (parsed as Record<string, unknown>))
  ) {
    return null;
  }
  const envelope = parsed as VersionedEnvelope;
  // v=2 wrappers decode as valid v=3 inputs — the v3 schema only adds optional
  // fields (mode, operator_state, provenance, data_sources), so a v=2 payload
  // is forward-compatible with no migration step.
  if (envelope.v !== CODEC_VERSION && envelope.v !== 2) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[profit-model] decode: unknown share-codec version ${envelope.v}; expected 2 or 3.`,
      );
    }
    return null;
  }
  if (!envelope.data || typeof envelope.data !== 'object') return null;
  return envelope.data;
}
