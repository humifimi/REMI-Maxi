/**
 * `useRotateBackToastStore` — simple Zustand store driving the
 * "rotate back to landscape" nudge after a save from a sheet that
 * was opened in landscape.
 *
 * PR 2.4 (2026-04-24) — paired companion to the existing
 * `presentation="sideways"` rotation prompt on form sheets. When the
 * user opens a form sheet in landscape, the sheet renders rotated
 * with a "Rotate to portrait" banner. They rotate, fill the form,
 * tap save. After the save fires, this toast fires to nudge them
 * back to landscape so they land on the calendar canvas they
 * started from — instead of getting marooned in portrait.
 *
 * The toast is tiny by design: one icon row + label + auto-dismiss.
 * The user can also tap it to dismiss early. Rotating the device
 * (orientation changes from portrait → landscape) auto-dismisses it
 * because the goal has been met.
 *
 * Why a Zustand store and not a hook + context? Because the trigger
 * fires from inside the BottomSheet's success path (deep in the
 * form sheet component) and the toast renders at the screen-root
 * level (outside the sheet). A store gives us a one-line trigger
 * surface (`useRotateBackToastStore.getState().show()`) without
 * threading callbacks through three layers.
 */

import { create } from "zustand";

interface RotateBackToastState {
  /** True when the toast should be visible. */
  visible: boolean;
  /** Show the toast. Idempotent — safe to call multiple times. */
  show: () => void;
  /** Hide the toast. Called by the auto-dismiss timer, on tap, or
   * on orientation change. */
  hide: () => void;
}

export const useRotateBackToastStore = create<RotateBackToastState>(
  (set) => ({
    visible: false,
    show: () => {
      if (__DEV__) console.log("[CAL:rotateBack] show");
      set({ visible: true });
    },
    hide: () => {
      if (__DEV__) console.log("[CAL:rotateBack] hide");
      set({ visible: false });
    },
  }),
);
