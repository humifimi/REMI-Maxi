import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { resolveApiBaseUrl, REMOTE_API_URL, setApiBaseUrl } from '@customer/constants/config';
import { useAuthStore } from '@/src/stores/auth';
import { ENDPOINTS } from './endpoints';
import type { ApiResponse } from '@customer/types/api';

const apiClient = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let hasResolvedBase = false;
let loggedBaseUrl = false;

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = resolveApiBaseUrl();
  const { accessToken } = useAuthStore.getState();
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (!hasResolvedBase && !loggedBaseUrl) {
    loggedBaseUrl = true;
    console.log('[API] Using base URL:', config.baseURL);
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

function isConnectionError(error: AxiosError): boolean {
  if (!error.response && error.code) {
    return ['ECONNREFUSED', 'ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'].includes(error.code);
  }
  return false;
}

apiClient.interceptors.response.use(
  (response) => {
    hasResolvedBase = true;
    return response;
  },
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _fallbackAttempted?: boolean;
    };

    if (
      !hasResolvedBase &&
      !originalRequest._fallbackAttempted &&
      isConnectionError(error)
    ) {
      originalRequest._fallbackAttempted = true;
      console.log('[API] Local backend unreachable, falling back to Render');
      setApiBaseUrl(REMOTE_API_URL);
      originalRequest.baseURL = REMOTE_API_URL;
      return apiClient(originalRequest);
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest._retry = true;
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const { refreshToken, setTokens, logout } = useAuthStore.getState();

    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    try {
      const response = await axios.post(`${resolveApiBaseUrl()}${ENDPOINTS.AUTH.REFRESH}`, {
        refreshToken,
      }, { timeout: 10_000 });

      const data = response.data?.data ?? response.data;
      const newAccessToken = data?.tokens?.accessToken ?? data?.accessToken;
      const newRefreshToken = data?.tokens?.refreshToken ?? data?.refreshToken;

      if (newAccessToken && newRefreshToken) {
        await setTokens(newAccessToken, newRefreshToken);
        processQueue(null, newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      }

      throw new Error('Invalid refresh response');
    } catch (refreshError) {
      processQueue(refreshError, null);
      logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
