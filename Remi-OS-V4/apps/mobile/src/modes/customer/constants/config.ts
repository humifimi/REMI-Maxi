import { Platform } from 'react-native';
import Constants from 'expo-constants';

const RENDER_URL = 'https://remi-api-ij2v.onrender.com/api/v1/customer';

function detectLanUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
    (Constants as any).manifest?.debuggerHost ??
    (Constants as any).manifest?.hostUri;

  if (hostUri) {
    const lanIp = hostUri.split(':')[0];
    if (lanIp && lanIp !== 'localhost' && lanIp !== '127.0.0.1') {
      return `http://${lanIp}:3000/api/v1/customer`;
    }
  }
  return null;
}

function getDefaultLocalUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1/customer';
  return 'http://localhost:3000/api/v1/customer';
}

export const REMOTE_API_URL = RENDER_URL;

let _resolvedLocalUrl: string | null = null;

export function getLocalApiUrl(): string {
  if (!_resolvedLocalUrl) {
    _resolvedLocalUrl = detectLanUrl() ?? getDefaultLocalUrl();
  }
  return _resolvedLocalUrl;
}

export const LOCAL_API_URL = getDefaultLocalUrl();

let _apiBaseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (_apiBaseUrl) return _apiBaseUrl;
  return getLocalApiUrl();
}

export let API_BASE_URL = getDefaultLocalUrl();

export function setApiBaseUrl(url: string) {
  _apiBaseUrl = url;
  API_BASE_URL = url;
}

export function resolveApiBaseUrl(): string {
  if (_apiBaseUrl) return _apiBaseUrl;
  const lanUrl = detectLanUrl();
  if (lanUrl) {
    API_BASE_URL = lanUrl;
    return lanUrl;
  }
  return API_BASE_URL;
}

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'remi_access_token',
  REFRESH_TOKEN: 'remi_refresh_token',
  USER: 'remi_user',
  BIOMETRIC_ENABLED: 'remi_biometric_enabled',
} as const;

export const ASYNC_STORAGE_KEYS = {
  ONBOARDING_PROGRESS: 'remi_onboarding_progress',
  NOTIFICATION_PREFS: 'remi_notification_prefs',
  FRANCHISE_THEME: 'remi_franchise_theme',
} as const;

/** Temporary default until franchise assignment is determined by customer location/account. */
export const DEFAULT_FRANCHISE_ID = 1;
