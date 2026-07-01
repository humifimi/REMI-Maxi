import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function OnboardingAddVehicleRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/customer/vehicle/add?from=onboarding');
  }, [router]);

  return null;
}
