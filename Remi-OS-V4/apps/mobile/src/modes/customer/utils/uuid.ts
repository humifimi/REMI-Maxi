/**
 * Lightweight RFC 4122 v4-shaped UUID generator.
 *
 * Used as the source of `Idempotency-Key` headers on POST /reorganizations
 * and friends (master plan §6.3). The middleware only requires `(user_id, key)`
 * uniqueness within a 24h window — `Math.random` collision odds across one
 * customer's modal-submit attempts are astronomically low, so we deliberately
 * avoid pulling in `expo-crypto` (which would force a native rebuild and
 * break the Phase D OTA-eligible default — see `.cursor/rules/eas-build-versioning.mdc`
 * Step 0 / "shim and OTA, not full build").
 *
 * If a future caller needs cryptographically-strong UUIDs, add `expo-crypto`
 * and replace this implementation while keeping the signature stable.
 */
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
