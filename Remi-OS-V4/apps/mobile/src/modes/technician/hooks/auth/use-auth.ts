import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@technician/api/query-client";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import type { LoginResponse, AuthUser } from "@technician/types/api";

interface FlatLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export function useLogin() {
  const { setTokens, setUser } = useAuthStore();

  return useMutation(
    {
      mutationFn: async (credentials: { email: string; password: string }) => {
        return api<LoginResponse | FlatLoginResponse>(
          "post",
          Endpoints.auth.login,
          credentials
        );
      },
      onSuccess: async (data) => {
        const accessToken =
          "tokens" in data && data.tokens
            ? data.tokens.accessToken
            : (data as FlatLoginResponse).accessToken;
        const refreshToken =
          "tokens" in data && data.tokens
            ? data.tokens.refreshToken
            : (data as FlatLoginResponse).refreshToken;

        await setTokens(accessToken, refreshToken);
        await setUser(data.user);
      },
    },
    queryClient
  );
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  return logout;
}
