// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // LDM-WAVE-2 CHUNK-2 (SHEETS-1) — Block raw imports of
    // `@gorhom/bottom-sheet`'s default + named `BottomSheet` export.
    // Every consumer must go through `<AppSheet>` from
    // `@/src/components/sheets`, which enforces half-width-on-landscape
    // and full-width-on-portrait by default. The other named exports
    // from the package (`BottomSheetScrollView`, `BottomSheetView`,
    // `TouchableOpacity`, etc.) are still allowed.
    //
    // The single sanctioned consumer of `BottomSheet` is the AppSheet
    // implementation file itself; it has a per-file
    // `eslint-disable-next-line no-restricted-imports` on its own
    // `BottomSheet` import.
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@gorhom/bottom-sheet',
              importNames: ['default', 'BottomSheet'],
              message:
                'Use <AppSheet> from @/src/components/sheets instead. AppSheet enforces half-width-on-landscape and full-width-on-portrait by default. Other named exports from @gorhom/bottom-sheet (BottomSheetScrollView, BottomSheetView, TouchableOpacity, etc.) are still allowed.',
            },
          ],
        },
      ],
    },
  },
]);
