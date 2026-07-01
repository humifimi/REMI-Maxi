import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '@/src/stores/auth';
import { useOnboardingStore } from '@/src/stores/customer/onboarding';
import { ThemeHydration } from '@customer/components/shared/theme-provider';
import { setupNotificationResponseHandler } from '@customer/services/push-notifications';

const STRIPE_PUBLISHABLE_KEY =
  Constants.expoConfig?.extra?.stripePublishableKey ?? '';
const rawScheme = Constants.expoConfig?.extra?.urlScheme ?? Constants.expoConfig?.scheme;
const URL_SCHEME =
  typeof rawScheme === 'string' ? rawScheme : rawScheme?.[0] ?? 'remitechnician';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

function AuthHydration({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    hydrate();
    hydrateOnboarding();
  }, [hydrate, hydrateOnboarding]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = setupNotificationResponseHandler();
    return () => sub.remove();
  }, [isAuthenticated]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      urlScheme={URL_SCHEME}
    >
      <QueryClientProvider client={queryClient}>
        <AuthHydration>
          <ThemeHydration>{children}</ThemeHydration>
        </AuthHydration>
      </QueryClientProvider>
    </StripeProvider>
  );
}
