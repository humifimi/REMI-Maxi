import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MaterialIcons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useResetPassword } from '@customer/hooks/auth/use-auth';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof schema>;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const resetPassword = useResetPassword();
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');

  const { control, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetForm) => {
    if (!token) {
      setApiError('Invalid or missing reset token.');
      return;
    }
    setApiError('');
    try {
      await resetPassword.mutateAsync({ token, password: data.password });
      setDone(true);
    } catch {
      setApiError('Reset failed. The link may have expired — request a new one.');
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneContent}>
          <MaterialIcons name="check-circle" size={64} color={Theme.colors.success} />
          <Text style={styles.doneTitle}>Password reset</Text>
          <Text style={styles.doneBody}>
            Your password has been updated. Sign in with your new password.
          </Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() => router.replace('/customer/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="Minimum 8 characters"
                placeholderTextColor={Theme.colors.textTertiary}
                secureTextEntry
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm password</Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.confirmPassword && styles.inputError]}
                placeholder="Re-enter your password"
                placeholderTextColor={Theme.colors.textTertiary}
                secureTextEntry
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.confirmPassword && (
            <Text style={styles.errorText}>{errors.confirmPassword.message}</Text>
          )}
        </View>

        {apiError !== '' && <Text style={styles.apiError}>{apiError}</Text>}

        <TouchableOpacity
          style={[styles.submitBtn, resetPassword.isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={resetPassword.isPending}
          activeOpacity={0.8}
        >
          {resetPassword.isPending ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Reset Password</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  content: { flex: 1, paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.xl },
  title: {
    fontSize: Theme.fontSize.xxxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  subtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: Theme.spacing.xl,
  },
  field: { marginBottom: Theme.spacing.lg },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.md,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  inputError: { borderColor: Theme.colors.error },
  errorText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.error,
    marginTop: Theme.spacing.xs,
  },
  apiError: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.error,
    textAlign: 'center',
    marginBottom: Theme.spacing.md,
  },
  submitBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md + 2,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    ...Theme.shadow.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.lg,
    fontWeight: '700',
  },
  doneContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.xl,
  },
  doneTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  doneBody: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Theme.spacing.xl,
  },
  signInBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xxl,
    ...Theme.shadow.md,
  },
  signInBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
