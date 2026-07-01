import { StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
// @demo-start
import { useDemoLogin } from '@customer/hooks/auth/use-auth';
import { AppModeSwitch } from '@/src/components/shared/app-mode-switch';
// @demo-end

export default function WelcomeScreen() {
  const router = useRouter();
  // @demo-start
  const demoLogin = useDemoLogin();

  const handleDemoLogin = (fleetRole?: 'fleet_manager' | 'fleet_driver') => {
    demoLogin.mutate(fleetRole ? { fleetRole } : undefined, {
      onError: (error: any) => {
        const msg = error?.response?.data?.message ?? error?.message ?? 'Demo login failed';
        Alert.alert('Demo Unavailable', msg);
      },
    });
  };
  // @demo-end

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>{Brand.appName}</Text>
        </View>
        <Text style={styles.tagline}>Mobile vehicle service,{'\n'}delivered to you.</Text>
        <Text style={styles.subtitle}>
          {Brand.serviceCopy.welcomeSubtitle}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/customer/register')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/login')}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryButtonText}>I Have an Account</Text>
        </TouchableOpacity>

        {/* @demo-start */}
        <View style={styles.demoDivider}>
          <View style={styles.demoDividerLine} />
          <Text style={styles.demoDividerText}>Try Demo</Text>
          <View style={styles.demoDividerLine} />
        </View>

        <View style={styles.demoRow}>
          <TouchableOpacity
            style={[styles.demoChip, demoLogin.isPending && styles.demoChipDisabled]}
            onPress={() => handleDemoLogin()}
            disabled={demoLogin.isPending}
            activeOpacity={0.7}
          >
            <Text style={styles.demoChipText}>Customer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.demoChip, demoLogin.isPending && styles.demoChipDisabled]}
            onPress={() => handleDemoLogin('fleet_manager')}
            disabled={demoLogin.isPending}
            activeOpacity={0.7}
          >
            <Text style={styles.demoChipText}>Fleet Manager</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.demoChip, demoLogin.isPending && styles.demoChipDisabled]}
            onPress={() => handleDemoLogin('fleet_driver')}
            disabled={demoLogin.isPending}
            activeOpacity={0.7}
          >
            <Text style={styles.demoChipText}>Fleet Driver</Text>
          </TouchableOpacity>
        </View>

        {demoLogin.isPending ? (
          <Text style={styles.demoLoadingText}>Loading demo...</Text>
        ) : null}
        {/* @demo-end */}

        <AppModeSwitch targetMode="technician" label="← Technician app" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    paddingHorizontal: Theme.spacing.lg,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.lg,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: Theme.colors.white,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
    marginBottom: Theme.spacing.md,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  actions: {
    paddingBottom: Theme.spacing.xl,
    gap: Theme.spacing.sm,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 16,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    ...Theme.shadow.md,
  },
  primaryButtonText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: Theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
  },
  secondaryButtonText: {
    color: Theme.colors.text,
    fontSize: Theme.fontSize.lg,
    fontWeight: '600',
  },
  // @demo-start
  demoDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Theme.spacing.md,
    gap: Theme.spacing.sm,
  },
  demoDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.border,
  },
  demoDividerText: {
    color: Theme.colors.textTertiary,
    fontSize: Theme.fontSize.sm,
    fontWeight: '500',
  },
  demoRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
  },
  demoChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    alignItems: 'center',
  },
  demoChipDisabled: {
    opacity: 0.5,
  },
  demoChipText: {
    color: Theme.colors.textSecondary,
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
  demoLoadingText: {
    textAlign: 'center',
    color: Theme.colors.textTertiary,
    fontSize: Theme.fontSize.sm,
    marginTop: Theme.spacing.xs,
  },
  // @demo-end
});
