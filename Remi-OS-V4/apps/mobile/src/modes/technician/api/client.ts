import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { Config } from "@technician/constants/config";
import { useAuthStore } from "@/src/stores/auth";
import type { ApiResponse } from "@technician/types/api";

const apiClient = axios.create({
  baseURL: `${Config.API_BASE_URL}${Config.API_PREFIX}`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach((pending) => {
    if (token) {
      pending.resolve(token);
    } else {
      pending.reject(error);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      await logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return apiClient(originalRequest);
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post<
        ApiResponse<{ accessToken: string; refreshToken: string }>
      >(`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/refresh`, {
        refreshToken,
      });

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      await setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export interface ApiRequestOptions {
  /**
   * Per-call HTTP headers merged on top of the client defaults +
   * auth interceptor's `Authorization` header. Used for headers
   * that are request-scoped (e.g. `Idempotency-Key` per master
   * plan §5.3.3 / §6.3 — generated per mutation invocation; the
   * caller is responsible for reusing the same key across retries
   * of the same logical operation).
   */
  headers?: Record<string, string>;
}

export async function api<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  data?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  const response = await apiClient.request<ApiResponse<T>>({
    method,
    url,
    data: method !== "get" ? data : undefined,
    params: method === "get" ? data : undefined,
    headers: options?.headers,
  });
  return response.data.data;
}

const franchiseClient = axios.create({
  baseURL: `${Config.API_BASE_URL}${Config.FRANCHISE_API_PREFIX}`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

franchiseClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  }
);

franchiseClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      await logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return franchiseClient(originalRequest);
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post<
        ApiResponse<{ accessToken: string; refreshToken: string }>
      >(`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/refresh`, {
        refreshToken,
      });

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      await setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return franchiseClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function franchiseApi<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  data?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  const response = await franchiseClient.request<ApiResponse<T>>({
    method,
    url,
    data: method !== "get" ? data : undefined,
    params: method === "get" ? data : undefined,
    headers: options?.headers,
  });
  return response.data.data;
}

// LDM-WAVE-1 CHUNK-4 — Admin axios client (`/api/v1/admin/...`).
// Used by the franchisor-only cross-franchise permissions admin
// (and any future admin-namespace endpoints). Mirrors `franchiseClient`
// in shape: bearer-token attach, 401-with-refresh retry, and a shared
// queue of failed requests so a token refresh in-flight doesn't fan
// out into N parallel refreshes.
const adminClient = axios.create({
  baseURL: `${Config.API_BASE_URL}${Config.ADMIN_API_PREFIX}`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

adminClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  }
);

adminClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      await logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return adminClient(originalRequest);
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post<
        ApiResponse<{ accessToken: string; refreshToken: string }>
      >(`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/refresh`, {
        refreshToken,
      });

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      await setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return adminClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function adminApi<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  data?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  const response = await adminClient.request<ApiResponse<T>>({
    method,
    url,
    data: method !== "get" ? data : undefined,
    params: method === "get" ? data : undefined,
    headers: options?.headers,
  });
  return response.data.data;
}

// Tools API client — backs `/api/v1/tools/...` (profit-model save/load, etc.).
// Mixes anonymous and authenticated calls: we attach the bearer token when
// present (so authenticated saves are owner-scoped) but never reject for its
// absence (anonymous create + read-by-share-token must work pre-auth).
const toolsClient = axios.create({
  baseURL: `${Config.API_BASE_URL}${Config.TOOLS_API_PREFIX}`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

toolsClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

toolsClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      // No refresh token to use — the caller (e.g. anonymous share-token
      // fetch) is allowed to proceed unauthenticated, so just propagate.
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return toolsClient(originalRequest);
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post<
        ApiResponse<{ accessToken: string; refreshToken: string }>
      >(`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/refresh`, {
        refreshToken,
      });

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      await setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return toolsClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function toolsApi<T>(
  method: "get" | "post" | "put" | "delete",
  url: string,
  data?: unknown
): Promise<T> {
  const response = await toolsClient.request<ApiResponse<T>>({
    method,
    url,
    data: method !== "get" ? data : undefined,
    params: method === "get" ? data : undefined,
  });
  return response.data.data;
}

// Signal API client — backs `/api/v1/signal/...` (feed, posts, comments,
// reactions). Signal is mounted at the global root in REMIBackend, not
// under /technician, so it needs its own client with the bare `/api/v1`
// prefix. Reuses the same auth + refresh interceptor pattern as the
// technician client because every signal endpoint requires a bearer token.
const signalClient = axios.create({
  baseURL: `${Config.API_BASE_URL}${Config.SIGNAL_API_PREFIX}`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

signalClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  }
);

signalClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      await logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return signalClient(originalRequest);
      });
    }

    isRefreshing = true;
    originalRequest._retry = true;

    try {
      const { data } = await axios.post<
        ApiResponse<{ accessToken: string; refreshToken: string }>
      >(`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/refresh`, {
        refreshToken,
      });

      const newAccess = data.data.accessToken;
      const newRefresh = data.data.refreshToken;
      await setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return signalClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function signalApi<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  data?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  const response = await signalClient.request<ApiResponse<T>>({
    method,
    url,
    data: method !== "get" ? data : undefined,
    params: method === "get" ? data : undefined,
    headers: options?.headers,
  });
  return response.data.data;
}

export { apiClient };
