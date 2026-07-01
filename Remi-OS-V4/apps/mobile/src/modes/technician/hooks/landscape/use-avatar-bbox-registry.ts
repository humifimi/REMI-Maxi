/**
 * Avatar bbox registry (P2-FE-8 — avatar slide-down selector).
 *
 * Cross-component channel for "where on the screen does each tech's
 * avatar tile currently sit?". The avatar strip
 * (`landscape/avatar-strip.tsx`, mounted inside
 * `LandscapeWorkweekView`) writes per-tile window-relative bboxes via
 * `registerAvatarBbox`. The embedded avatar selector
 * (`embedded-avatar-selector.tsx`, mounted at the calendar tab root
 * inside `FloatingDraftCard`) reads them via `getAvatarBbox` to
 * derive the start position for its slide-down entrance animation.
 *
 * Why a separate registry (instead of consuming bboxes directly from
 * `useDragToAvatar`):
 *   - `useDragToAvatar` is mounted inside `LandscapeWorkweekView`,
 *     several layers deep. The selector is mounted at the tab root.
 *     React Context would force every consumer of the existing strip
 *     to opt into a provider; a Zustand store has zero plumbing
 *     cost.
 *   - The registry is a pure read-side cache keyed by tech id. It
 *     does not own gesture state, so coupling it to the drag hook
 *     would mix unrelated concerns.
 *
 * Bboxes are NOT persisted — they're transient layout data that
 * become invalid the instant the strip remounts (rotation, view
 * switch). Consumers should treat a missing entry as "no source
 * position known; fall back to a default entrance" rather than
 * blocking on a registration.
 */

import { create } from "zustand";

export interface AvatarTileBbox {
  /** Window X of the tile's left edge (pt). */
  x: number;
  /** Window Y of the tile's top edge (pt). */
  y: number;
  /** Tile width (pt). */
  w: number;
  /** Tile height (pt). */
  h: number;
}

interface AvatarBboxState {
  /**
   * Map of tech id (as a string key — Zustand stores store object
   * keys as strings; we coerce on read) → window-relative bbox of
   * the avatar tile currently mounted for that tech.
   *
   * `null`-valued entries are treated as "explicitly unregistered"
   * so a stale read (consumer was registered, tile unmounted, then
   * the consumer re-checks) returns null instead of a stale bbox.
   * In practice the unregister path simply deletes the key, so
   * lookups return `undefined` for both "never registered" and
   * "unregistered." Consumers should treat both the same.
   */
  bboxes: Record<string, AvatarTileBbox>;

  /**
   * Register or update an avatar tile's bounding box. Pass `null`
   * to unregister (e.g. on tile unmount, on rotation away from
   * landscape).
   */
  registerAvatarBbox: (techId: number, bbox: AvatarTileBbox | null) => void;

  /** Synchronous read for use outside React (animations, callbacks). */
  getAvatarBbox: (techId: number) => AvatarTileBbox | undefined;

  /** Clear every registered bbox. Call on rotation away from landscape. */
  clearAll: () => void;
}

export const useAvatarBboxRegistry = create<AvatarBboxState>((set, get) => ({
  bboxes: {},

  registerAvatarBbox: (techId, bbox) => {
    const key = String(techId);
    set((state) => {
      const next = { ...state.bboxes };
      if (bbox === null) {
        if (!(key in next)) return state;
        delete next[key];
      } else {
        const prev = next[key];
        if (
          prev
          && prev.x === bbox.x
          && prev.y === bbox.y
          && prev.w === bbox.w
          && prev.h === bbox.h
        ) {
          return state;
        }
        next[key] = bbox;
      }
      return { bboxes: next };
    });
  },

  getAvatarBbox: (techId) => get().bboxes[String(techId)],

  clearAll: () => set({ bboxes: {} }),
}));
