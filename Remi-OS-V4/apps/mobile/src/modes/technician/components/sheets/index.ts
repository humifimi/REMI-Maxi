export { AppSheet, type AppSheetProps } from "./AppSheet";
export {
  useSheetSide,
  resolveSheetSide,
  type SheetSide,
  type UseSheetSideInput,
  type UseSheetSideResult,
} from "./use-sheet-side";

// Type-only re-export so consumers can `useRef<AppSheetRef>(null)`
// and `forwardRef<AppSheetRef, …>(…)` without importing
// `@gorhom/bottom-sheet`'s default export directly (which the
// `no-restricted-imports` rule in `eslint.config.js` blocks).
// eslint-disable-next-line no-restricted-imports
export type { default as AppSheetRef } from "@gorhom/bottom-sheet";
