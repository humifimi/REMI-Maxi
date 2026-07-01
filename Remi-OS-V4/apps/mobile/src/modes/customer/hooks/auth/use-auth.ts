import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { useAuthStore } from '@/src/stores/auth';
import type { ApiResponse, LoginResponse, RegisterRequest } from '@customer/types/api';

export function useLogin() {
  const { setTokens, setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      console.log('[auth/login] request', {
        email: credentials.email,
        passwordLength: credentials.password.length,
        url: ENDPOINTS.AUTH.LOGIN,
        baseURL: apiClient.defaults.baseURL,
      });
      try {
        const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
          ENDPOINTS.AUTH.LOGIN,
          credentials
        );
        console.log('[auth/login] response', {
          status: 200,
          hasUser: !!data.data?.user,
          hasAccessToken: !!data.data?.tokens?.accessToken,
          hasRefreshToken: !!data.data?.tokens?.refreshToken,
          userId: data.data?.user?.userId,
          role: data.data?.user?.role,
        });
        return data.data;
      } catch (err) {
        if (isAxiosError(err)) {
          console.error('[auth/login] axios error', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            responseData: err.response?.data,
            requestUrl: err.config?.url,
            requestBaseURL: err.config?.baseURL,
            message: err.message,
            code: err.code,
          });
        } else {
          console.error('[auth/login] non-axios error', err);
        }
        throw err;
      }
    },
    onMutate: () => {
      console.log('[auth/login] mutation onMutate');
    },
    onSuccess: async (data) => {
      console.log('[auth/login] onSuccess', {
        userId: data.user?.userId,
        role: data.user?.role,
      });
      const tokens = data.tokens;
      if (tokens?.accessToken && tokens?.refreshToken) {
        await setTokens(tokens.accessToken, tokens.refreshToken);
        console.log('[auth/login] setTokens done');
      } else {
        console.warn('[auth/login] no tokens in response');
      }
      if (data.user) {
        await setUser(data.user);
        console.log('[auth/login] setUser done', {
          isAuthenticated: useAuthStore.getState().isAuthenticated,
        });
      } else {
        console.warn('[auth/login] no user in response');
      }
    },
    onError: (err) => {
      console.error('[auth/login] mutation onError', {
        type: err instanceof Error ? err.constructor.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

// @demo-start
export function useDemoLogin() {
  const { setTokens, setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (opts?: { fleetRole?: 'fleet_manager' | 'fleet_driver' }) => {
      const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
        ENDPOINTS.AUTH.DEMO_LOGIN
      );
      return { loginData: data.data, fleetRole: opts?.fleetRole ?? null };
    },
    onSuccess: async ({ loginData, fleetRole }) => {
      if (fleetRole) {
        useAuthStore.setState({ demoFleetMode: true, demoFleetRole: fleetRole });
      }
      const tokens = loginData.tokens;
      if (tokens?.accessToken && tokens?.refreshToken) {
        await setTokens(tokens.accessToken, tokens.refreshToken);
      }
      if (loginData.user) {
        const user = {
          ...loginData.user,
          ...(fleetRole && {
            fleetCompanyId: 1,
            fleetRole,
          }),
        };
        await setUser(user);
      }
    },
  });
}
// @demo-end

export function useRegister() {
  const { setTokens, setUser } = useAuthStore();

  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
        ENDPOINTS.AUTH.REGISTER,
        { ...body, role: 'customer' }
      );
      return data.data;
    },
    onSuccess: async (data) => {
      const tokens = data.tokens;
      if (tokens?.accessToken && tokens?.refreshToken) {
        await setTokens(tokens.accessToken, tokens.refreshToken);
      }
      if (data.user) {
        await setUser(data.user);
      }
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (body: { email: string }) => {
      const { data } = await apiClient.post<ApiResponse<{ message: string }>>(
        ENDPOINTS.AUTH.FORGOT_PASSWORD,
        body,
      );
      return data.data;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: { token: string; password: string }) => {
      const { data } = await apiClient.post<ApiResponse<{ message: string }>>(
        ENDPOINTS.AUTH.RESET_PASSWORD,
        body,
      );
      return data.data;
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post(ENDPOINTS.AUTH.LOGOUT);
      } catch {
        // Logout even if the server call fails
      }
    },
    onSettled: () => {
      logout();
    },
  });
}
