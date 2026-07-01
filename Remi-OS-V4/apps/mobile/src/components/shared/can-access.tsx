/**
 * LDM-WAVE-1 CHUNK-2 — Declarative capability gate.
 *
 * Renders `children` only when the current user has the requested
 * capability. The default behavior is `mode="hide"`, which is the
 * right choice for buttons / menu items / nav links: if the user
 * doesn't have the cap, the control disappears entirely (or is
 * replaced by `fallback` if provided).
 *
 * `mode="disable"` is for cases where pure hide would confuse the UI
 * — e.g. a form section that should remain visible (so the user
 * understands what feature is there) but should not be interactable.
 * In that mode the children are always rendered, but when the cap is
 * absent they're wrapped in a `<View>` with reduced opacity and
 * `pointerEvents="none"`, which both visually dims and disables touch
 * forwarding.
 *
 * Fail-closed: this component shares the underlying `useCapability`
 * hook, which returns `false` while loading and on error. That means
 * `mode="hide"` renders `null`/fallback during the brief
 * post-login window before `/auth/me/capabilities` resolves; this is
 * intentional. It is the same contract a server-rendered "permission
 * denied" placeholder would give.
 *
 * Why this is a thin component (no extra logic beyond the
 * `useCapability` call):
 *
 *   - It exists primarily so call sites read like permission
 *     declarations rather than imperative conditionals. Reviewers
 *     can scan a screen and immediately see which buttons are
 *     capability-gated without having to follow a `boolean` variable
 *     back to its definition.
 *   - The closed `Capability` union on the `capability` prop catches
 *     typos at compile time, which a `useCapability("dispath.reassign")
 *     ?? null` shape would miss.
 *
 * Migration shape (from CHUNK-2 coverage pass):
 *
 *   // Before
 *   {role === UserRole.FRANCHISE_OWNER && <ReassignButton />}
 *
 *   // After
 *   <CanAccess capability="dispatch.reassign">
 *     <ReassignButton />
 *   </CanAccess>
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-2 — Permissions wiring (FE half)
 */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useCapability } from "@technician/hooks/auth/use-capability";
import type { Capability } from "@technician/types/capabilities";

export type CanAccessMode = "hide" | "disable";

export interface CanAccessProps {
  capability: Capability;
  /**
   * Rendered when the capability is absent under `mode="hide"`.
   * Ignored under `mode="disable"`. Defaults to `null`.
   */
  fallback?: ReactNode;
  /**
   * `"hide"` (default) — `children` are only mounted when the cap is
   * present. Otherwise renders `fallback ?? null`.
   *
   * `"disable"` — `children` are always mounted. When the cap is
   * absent they're wrapped in a dimmed, non-interactive `<View>`.
   */
  mode?: CanAccessMode;
  children: ReactNode;
}

export function CanAccess({
  capability,
  fallback = null,
  mode = "hide",
  children,
}: CanAccessProps) {
  const hasCapability = useCapability(capability);

  if (mode === "disable") {
    if (hasCapability) {
      return <>{children}</>;
    }
    return (
      <View style={styles.disabled} pointerEvents="none">
        {children}
      </View>
    );
  }

  if (hasCapability) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4,
  },
});
