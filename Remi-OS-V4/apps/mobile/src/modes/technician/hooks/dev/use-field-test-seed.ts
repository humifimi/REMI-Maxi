// 2026-05-25 — Field-test calendar seeder hooks.
// Pair with the BE endpoints registered in
// REMIBackend/src/routes/v1/technician/index.ts under
// /dev/field-test-seed/*. Gated on the BE by `@maxi-mobile.com`
// email domain — these hooks call the endpoints regardless and rely
// on the 403 to surface the failure to non-field-test accounts.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";

/**
 * Returns true when the signed-in user is a field-test identity
 * (email under @maxi-mobile.com). Mirrors the BE gate exactly so the
 * settings UI only renders the seed controls when the user can
 * actually invoke them.
 */
export function useIsFieldTestIdentity(): boolean {
  const user = useAuthStore((s) => s.user);
  const email = (user?.email ?? "").toLowerCase();
  return email.endsWith("@maxi-mobile.com");
}

interface ReseedResult {
  weekStart: string;
  weekEnd: string;
  appointmentsCreated: number;
  seedRowsWiped: number;
  addresslessRowsWiped: number;
}

interface ClearResult {
  deleted: number;
}

/**
 * Compute the local Monday "YYYY-MM-DD" for the current week so the
 * BE seeds against the operator's local calendar, not Render's UTC
 * day. Sunday is treated as the END of the prior week (matches the
 * BE's `mondayOfWeek` helper).
 */
function currentMondayISO(): string {
  const d = new Date();
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const offset = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() + offset);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

export function useReseedFieldTestWeek() {
  const qc = useQueryClient();
  return useMutation<ReseedResult, Error, { includeAddresslessCleanup?: boolean } | void>({
    mutationFn: async (args) => {
      return api<ReseedResult>("post", Endpoints.fieldTestSeed.reseed, {
        week_start_iso: currentMondayISO(),
        include_addressless_cleanup:
          args?.includeAddresslessCleanup !== false,
      });
    },
    onSuccess: () => {
      // Bust every calendar/orders/customers query so the new
      // appointments land everywhere immediately.
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function useClearFieldTestSeed() {
  const qc = useQueryClient();
  return useMutation<ClearResult, Error, void>({
    mutationFn: async () => {
      return api<ClearResult>("post", Endpoints.fieldTestSeed.clear, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}
