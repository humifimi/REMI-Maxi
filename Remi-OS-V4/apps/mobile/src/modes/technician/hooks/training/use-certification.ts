import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  CertificationProgressResponse,
  CertificationStandingResponse,
} from "@technician/types/api";

// PLAN-DEVIATION: 2026-04-25-training-xp-be-shape-bridge — BE returns a
// thinner certification-progress payload (current_level/current_level_name +
// milestones + total_xp + progress_pct) than the FE consumes (adds
// competencies / unlocked / next_unlocks / pay tiers / badge emoji /
// next_level fields). Bridged via mapBackendCertificationProgress with empty
// arrays for the BE-absent fields. See
// docs/PLAN-DEVIATIONS.md#2026-04-25-training-xp-be-shape-bridge.

interface BackendCertificationMilestone {
  level: number;
  name: string;
  reached: boolean;
  xp_required: number;
}

interface BackendCertificationProgress {
  current_level: number;
  current_level_name: string;
  milestones: BackendCertificationMilestone[];
  total_xp: number;
  progress_pct: number;
}

function mapBackendCertificationProgress(
  be: BackendCertificationProgress,
): CertificationProgressResponse {
  const milestones = Array.isArray(be?.milestones) ? be.milestones : [];
  const nextMilestone = milestones.find(
    (m) => m.level > (be?.current_level ?? 0),
  );
  return {
    current_level: be?.current_level ?? 1,
    current_level_name: be?.current_level_name ?? "Rookie Tech",
    current_badge_emoji: "",
    next_level: nextMilestone?.level ?? null,
    next_level_name: nextMilestone?.name ?? null,
    competencies: [],
    unlocked: [],
    next_unlocks: [],
    current_pay_tier: null,
    next_pay_tier: null,
  };
}

export function useCertificationProgress() {
  return useQuery({
    queryKey: ["certification", "progress"],
    queryFn: async () => {
      const be = await api<BackendCertificationProgress>(
        "get",
        Endpoints.certification.progress,
      );
      return mapBackendCertificationProgress(be);
    },
    staleTime: 30_000,
  });
}

export function useCertificationStanding() {
  return useQuery({
    queryKey: ["certification", "standing"],
    queryFn: () =>
      api<CertificationStandingResponse>(
        "get",
        Endpoints.certification.standing,
      ),
    staleTime: 60_000,
  });
}
