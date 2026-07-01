import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import type { ProfitModelInputs } from "@profit-model/types";
import { defaults } from "@profit-model/presets";

const KEY = "profit-model.last-scenario";
const DEBOUNCE_MS = 500;

export type ScenarioState = {
  inputs: ProfitModelInputs;
  hydrated: boolean;
  setInputs: (next: ProfitModelInputs) => void;
};

function clone(src: ProfitModelInputs): ProfitModelInputs {
  return JSON.parse(JSON.stringify(src)) as ProfitModelInputs;
}

// Per-top-level-key shape sanitizer. The persisted blob comes from whichever
// OTA last wrote it, which may predate an engine resync. We don't crash on a
// stale blob — we drop any field whose runtime type no longer matches the
// current `defaults` shape (array vs object vs primitive). The engine itself
// is forgiving about missing optional fields, so falling back to the default
// for that one slot is always safer than letting a wrong-type value through
// and crashing the JSX downstream (e.g. `inputs.fixed_costs.map` on a value
// that's no longer an array).
function sameShape(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  return typeof a === typeof b;
}

function mergePersisted(
  base: ProfitModelInputs,
  parsed: Record<string, unknown>
): ProfitModelInputs {
  const merged = clone(base) as unknown as Record<string, unknown>;
  const baseRecord = base as unknown as Record<string, unknown>;
  for (const key of Object.keys(parsed)) {
    const next = parsed[key];
    if (next === undefined) continue;
    if (!(key in baseRecord)) {
      merged[key] = next;
      continue;
    }
    if (sameShape(baseRecord[key], next)) {
      merged[key] = next;
    }
  }
  return merged as unknown as ProfitModelInputs;
}

export function usePersistedScenario(): ScenarioState {
  const [inputs, setInputsState] = useState<ProfitModelInputs>(() => clone(defaults));
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setInputsState(
                mergePersisted(defaults, parsed as Record<string, unknown>)
              );
            }
          } catch {
            // Corrupted entry: ignore and keep defaults.
          }
        }
      })
      .catch(() => {
        // SecureStore unavailable (rare); keep defaults.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      SecureStore.setItemAsync(KEY, JSON.stringify(inputs)).catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [inputs, hydrated]);

  return { inputs, hydrated, setInputs: setInputsState };
}

export async function clearPersistedScenario(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
