import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getBiometricLabel, useBiometric } from '@customer/hooks/auth/use-biometric';

const mocked = jest.mocked(LocalAuthentication);

beforeEach(() => {
  jest.clearAllMocks();
  // Restore the default "biometrics available + Face ID enrolled" behavior
  // (the global setup already sets these, but tests below override them).
  mocked.hasHardwareAsync.mockResolvedValue(true);
  mocked.isEnrolledAsync.mockResolvedValue(true);
  mocked.supportedAuthenticationTypesAsync.mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  ]);
  mocked.authenticateAsync.mockResolvedValue({
    success: true,
    error: undefined,
  } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>);
});

describe('getBiometricLabel', () => {
  it.each([
    ['face' as const, 'Face ID'],
    ['fingerprint' as const, 'Touch ID'],
    [null, 'Biometrics'],
  ])('label for %s -> "%s"', (type, expected) => {
    expect(getBiometricLabel(type)).toBe(expected);
  });
});

describe('useBiometric', () => {
  it('starts in checking state and resolves to face when Face ID is enrolled', async () => {
    const { result } = renderHook(() => useBiometric());

    expect(result.current.isChecking).toBe(true);

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.biometricType).toBe('face');
  });

  it('detects fingerprint when only fingerprint is enrolled', async () => {
    mocked.supportedAuthenticationTypesAsync.mockResolvedValueOnce([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);

    const { result } = renderHook(() => useBiometric());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.biometricType).toBe('fingerprint');
  });

  it('reports unavailable when hardware is missing', async () => {
    mocked.hasHardwareAsync.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useBiometric());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.biometricType).toBeNull();
  });

  it('reports unavailable when hardware exists but nothing is enrolled', async () => {
    mocked.isEnrolledAsync.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useBiometric());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.biometricType).toBeNull();
  });

  it('handles a thrown error from the native module gracefully', async () => {
    mocked.hasHardwareAsync.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useBiometric());

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
    });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.biometricType).toBeNull();
  });

  describe('authenticate()', () => {
    it('returns success=true when the native prompt succeeds', async () => {
      const { result } = renderHook(() => useBiometric());
      await waitFor(() => expect(result.current.isChecking).toBe(false));

      let outcome: { success: boolean; error?: string } = { success: false };
      await act(async () => {
        outcome = await result.current.authenticate();
      });

      expect(outcome).toEqual({ success: true });
      expect(mocked.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptMessage: 'Unlock MAXI',
          disableDeviceFallback: true,
          cancelLabel: 'Use Password',
        }),
      );
    });

    it('returns success=false with the native error tag when the prompt rejects', async () => {
      mocked.authenticateAsync.mockResolvedValueOnce({
        success: false,
        error: 'user_cancel',
      } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>);

      const { result } = renderHook(() => useBiometric());
      await waitFor(() => expect(result.current.isChecking).toBe(false));

      let outcome: { success: boolean; error?: string } = { success: true };
      await act(async () => {
        outcome = await result.current.authenticate();
      });

      expect(outcome).toEqual({ success: false, error: 'user_cancel' });
    });

    it('returns success=false with native_throw when the native call throws', async () => {
      mocked.authenticateAsync.mockRejectedValueOnce(new Error('LAErrorSystemCancel'));

      const { result } = renderHook(() => useBiometric());
      await waitFor(() => expect(result.current.isChecking).toBe(false));

      let outcome: { success: boolean; error?: string } = { success: true };
      await act(async () => {
        outcome = await result.current.authenticate();
      });

      expect(outcome).toEqual({ success: false, error: 'native_throw' });
    });

    it('falls back to "unknown" when the native module returns no error tag', async () => {
      mocked.authenticateAsync.mockResolvedValueOnce({
        success: false,
      } as Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>);

      const { result } = renderHook(() => useBiometric());
      await waitFor(() => expect(result.current.isChecking).toBe(false));

      let outcome: { success: boolean; error?: string } = { success: true };
      await act(async () => {
        outcome = await result.current.authenticate();
      });

      expect(outcome).toEqual({ success: false, error: 'unknown' });
    });
  });
});
