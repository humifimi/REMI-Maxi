import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Brand } from '@customer/constants/brand';

type BiometricType = 'face' | 'fingerprint' | null;

export interface BiometricAuthResult {
  success: boolean;
  // Native error code from `expo-local-authentication` (e.g. `user_cancel`,
  // `system_cancel`, `lockout`, `not_enrolled`) when the prompt fails. Only
  // ever a short tag string — never includes user-identifying data — so it is
  // safe to log for diagnostics.
  error?: string;
}

interface BiometricState {
  isAvailable: boolean;
  biometricType: BiometricType;
  isChecking: boolean;
  authenticate: () => Promise<BiometricAuthResult>;
}

function mapAuthType(types: LocalAuthentication.AuthenticationType[]): BiometricType {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'face';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  return null;
}

export function getBiometricLabel(type: BiometricType): string {
  switch (type) {
    case 'face':
      return 'Face ID';
    case 'fingerprint':
      return 'Touch ID';
    default:
      return 'Biometrics';
  }
}

export function useBiometric(): BiometricState {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

        if (!cancelled) {
          const available = hasHardware && isEnrolled;
          setIsAvailable(available);
          setBiometricType(available ? mapAuthType(types) : null);
        }
      } catch {
        if (!cancelled) {
          setIsAvailable(false);
          setBiometricType(null);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(async (): Promise<BiometricAuthResult> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Unlock ${Brand.appName}`,
        disableDeviceFallback: true,
        cancelLabel: 'Use Password',
      });
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: result.error ?? 'unknown' };
    } catch {
      return { success: false, error: 'native_throw' };
    }
  }, []);

  return { isAvailable, biometricType, isChecking, authenticate };
}
