import { useCallback, useEffect, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { EXPO_GO_GUARDS_ACTIVE } from "@technician/constants/runtime";

type BiometricType = "face" | "fingerprint" | null;

interface BiometricState {
  isAvailable: boolean;
  biometricType: BiometricType;
  isChecking: boolean;
  authenticate: () => Promise<boolean>;
}

function mapAuthType(
  types: LocalAuthentication.AuthenticationType[]
): BiometricType {
  if (
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  ) {
    return "face";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "fingerprint";
  }
  return null;
}

export function getBiometricLabel(type: BiometricType): string {
  switch (type) {
    case "face":
      return "Face ID";
    case "fingerprint":
      return "Touch ID";
    default:
      return "Biometrics";
  }
}

export function useBiometric(): BiometricState {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (EXPO_GO_GUARDS_ACTIVE) {
      setIsAvailable(false);
      setBiometricType(null);
      setIsChecking(false);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();

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

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (EXPO_GO_GUARDS_ACTIVE) {
      return false;
    }

    try {
      if (__DEV__) {
        console.log("[BIOMETRIC] authenticateAsync called");
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock REMI",
        disableDeviceFallback: true,
        cancelLabel: "Use Password",
      });
      if (__DEV__) {
        console.log("[BIOMETRIC] result:", JSON.stringify(result));
      }
      return result.success;
    } catch (e) {
      if (__DEV__) {
        console.error("[BIOMETRIC] error:", e);
      }
      return false;
    }
  }, []);

  return { isAvailable, biometricType, isChecking, authenticate };
}
