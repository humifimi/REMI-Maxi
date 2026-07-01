import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/src/stores/auth';
import { SECURE_STORE_KEYS } from '@customer/constants/config';
import { UserRole } from '@customer/types/enums';
import type { AuthUser } from '@customer/types/api';

const mockedSecureStore = jest.mocked(SecureStore);

const sampleUser: AuthUser = {
  userId: 42,
  email: 'driver@example.com',
  role: UserRole.CUSTOMER,
  fullName: 'Test Driver',
};

function resetStore() {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    isHydrated: false,
    biometricRequired: false,
    demoFleetMode: false,
    demoFleetRole: null,
  });
}

beforeEach(() => {
  resetStore();
  // Wipe the in-memory SecureStore between tests.
  // The mock exposes its backing Map as `__store`.
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  jest.clearAllMocks();
});

describe('useAuthStore', () => {
  describe('setTokens', () => {
    it('persists tokens to SecureStore and flips isAuthenticated', async () => {
      await useAuthStore.getState().setTokens('access-123', 'refresh-456');

      expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
        SECURE_STORE_KEYS.ACCESS_TOKEN,
        'access-123',
      );
      expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
        SECURE_STORE_KEYS.REFRESH_TOKEN,
        'refresh-456',
      );

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('access-123');
      expect(state.refreshToken).toBe('refresh-456');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('setUser', () => {
    it('serializes the user and stores it', async () => {
      await useAuthStore.getState().setUser(sampleUser);

      expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
        SECURE_STORE_KEYS.USER,
        JSON.stringify(sampleUser),
      );
      expect(useAuthStore.getState().user).toEqual(sampleUser);
    });
  });

  describe('logout', () => {
    it('clears tokens, user, and SecureStore entries', async () => {
      await useAuthStore.getState().setTokens('a', 'b');
      await useAuthStore.getState().setUser(sampleUser);

      await useAuthStore.getState().logout();

      expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN);
      expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.REFRESH_TOKEN);
      expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.USER);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('hydrate', () => {
    it('marks hydrated even when SecureStore is empty', async () => {
      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.isHydrated).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('restores tokens and user when present and biometrics disabled', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, 'access-x');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, 'refresh-x');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER, JSON.stringify(sampleUser));

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('access-x');
      expect(state.refreshToken).toBe('refresh-x');
      expect(state.user).toEqual(sampleUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.biometricRequired).toBe(false);
      expect(state.isHydrated).toBe(true);
    });

    it('requires biometrics when the preference is enabled', async () => {
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, 'access-x');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, 'refresh-x');
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER, JSON.stringify(sampleUser));
      await SecureStore.setItemAsync(SECURE_STORE_KEYS.BIOMETRIC_ENABLED, 'true');

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.biometricRequired).toBe(true);
      expect(state.isHydrated).toBe(true);
    });

    it('still marks hydrated when SecureStore throws', async () => {
      mockedSecureStore.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));

      await useAuthStore.getState().hydrate();

      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('biometric preference helpers', () => {
    it('round-trips the enabled flag', async () => {
      await useAuthStore.getState().setBiometricEnabled(true);
      await expect(useAuthStore.getState().getBiometricEnabled()).resolves.toBe(true);
      await expect(useAuthStore.getState().hasBiometricPreference()).resolves.toBe(true);

      await useAuthStore.getState().setBiometricEnabled(false);
      await expect(useAuthStore.getState().getBiometricEnabled()).resolves.toBe(false);
    });

    it('returns false/null-like when no preference is stored', async () => {
      await expect(useAuthStore.getState().getBiometricEnabled()).resolves.toBe(false);
      await expect(useAuthStore.getState().hasBiometricPreference()).resolves.toBe(false);
    });
  });

  describe('completeBiometric', () => {
    it('only authenticates when tokens and user exist', () => {
      useAuthStore.setState({ biometricRequired: true });
      useAuthStore.getState().completeBiometric();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      useAuthStore.setState({
        accessToken: 'a',
        refreshToken: 'b',
        user: sampleUser,
        biometricRequired: true,
      });
      useAuthStore.getState().completeBiometric();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.biometricRequired).toBe(false);
    });
  });
});
