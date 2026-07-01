import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Config } from "@technician/constants/config";
import { useAuthStore } from "@/src/stores/auth";
import type { AuthUser, LoginResponse } from "@technician/types/api";

interface UnifiedLoginApiUser {
  id: number;
  userId?: number;
  email: string;
  role: AuthUser["role"];
  roleId?: number;
  fleetRoleId?: number | null;
  fullName: string;
  profileImageUrl?: string | null;
  franchiseId?: number;
  fleetCompanyId?: number | null;
  fleetRole?: string | null;
  fleetRoleId?: number | null;
  appMode?: "customer" | "technician";
}

interface UnifiedLoginApiResponse {
  error: boolean;
  message: string;
  data: {
    tokens: { accessToken: string; refreshToken: string };
    user: UnifiedLoginApiUser;
  };
}

function normalizeUser(raw: UnifiedLoginApiUser): AuthUser {
  return {
    userId: raw.userId ?? raw.id,
    email: raw.email,
    role: raw.role,
    roleId: raw.roleId,
    fleetRoleId: raw.fleetRoleId,
    fullName: raw.fullName,
    profileImageUrl: raw.profileImageUrl ?? null,
    franchiseId: raw.franchiseId,
    fleetCompanyId: raw.fleetCompanyId,
    fleetRole: raw.fleetRole,
    appMode: raw.appMode,
  };
}

/** Single login entry point for all roles — POST /api/v1/auth/login. */
export function useUnifiedLogin() {
  const { setTokens, setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await axios.post<UnifiedLoginApiResponse>(
        `${Config.API_BASE_URL}/api/v1/auth/login`,
        credentials,
        { timeout: 15000, headers: { "Content-Type": "application/json" } }
      );
      if (data.error || !data.data?.tokens || !data.data?.user) {
        throw new Error(data.message || "Login failed");
      }
      return {
        tokens: data.data.tokens,
        user: normalizeUser(data.data.user),
      } satisfies LoginResponse;
    },
    onSuccess: async (data) => {
      await setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      await setUser(data.user);
    },
  });
}
