import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";

export interface RoleRecord {
  id: number;
  name: string;
  description: string;
  role_enum: string;
  status: "active" | "inactive";
}

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await api<{ roles: RoleRecord[] }>("get", "/roles");
      return res.roles ?? [];
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description: string; role_enum: string }) =>
      api<{ role: RoleRecord }>("post", "/roles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      description?: string;
      status?: "active" | "inactive";
    }) => api<{ role: RoleRecord }>("patch", `/roles/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useSetRoleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "active" | "inactive" }) =>
      api<{ role: RoleRecord }>("patch", `/roles/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}
