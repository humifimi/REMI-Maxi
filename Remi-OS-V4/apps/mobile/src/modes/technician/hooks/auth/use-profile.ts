import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { User } from "@technician/types/api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api<User>("get", Endpoints.profile),
    staleTime: 300_000,
  });
}
