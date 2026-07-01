import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TrainingXPSummary } from "@technician/types/api";

// PLAN-DEVIATION: 2026-04-25-training-xp-be-shape-bridge — BE returns
// `XpSummary` (current_level: object, badges_earned: count, no recent_xp /
// no milestones / no modules_completed); FE consumes flat `TrainingXPSummary`.
// See docs/PLAN-DEVIATIONS.md#2026-04-25-training-xp-be-shape-bridge for the
// per-field translation table and the rationale for keeping arrays empty
// rather than chaining the /xp/history + /xp/levels + module-completion-count
// fetches into this hook.

interface BackendXpLevel {
  id: number;
  level: number;
  name: string;
  xp_required: number;
  icon_url: string | null;
}

interface BackendXpSummary {
  total_xp: number;
  current_level: BackendXpLevel;
  next_level: BackendXpLevel | null;
  xp_to_next_level: number;
  progress_pct: number;
  badges_earned: number;
}

function mapBackendXpSummary(be: BackendXpSummary): TrainingXPSummary {
  const totalXp = be.total_xp ?? 0;
  const currentLevelBaseline = be.current_level?.xp_required ?? 0;
  return {
    total_xp: totalXp,
    current_level: be.current_level?.level ?? 1,
    current_level_name: be.current_level?.name ?? "Rookie Tech",
    xp_to_next_level: be.xp_to_next_level ?? 0,
    xp_in_current_level: Math.max(0, totalXp - currentLevelBaseline),
    modules_completed: 0,
    recent_xp: [],
    badges: [],
    milestones: [],
  };
}

export function useTrainingXP() {
  return useQuery({
    queryKey: ["training", "xp-summary"],
    queryFn: async () => {
      const be = await api<BackendXpSummary>("get", Endpoints.xp.summary);
      return mapBackendXpSummary(be);
    },
    staleTime: 60_000,
  });
}
