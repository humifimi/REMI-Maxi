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
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MaterialIcons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { useForgotPassword } from '@customer/hooks/auth/use-auth';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const forgotPassword = useForgotPassword();
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState('');

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<ForgotForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotForm) => {
    setApiError('');
    try {
      await forgotPassword.mutateAsync({ email: data.email });
      setSent(true);
    } catch {
      setApiError('Something went wrong. Please try again.');
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.sentContent}>
          <MaterialIcons name="mark-email-read" size={64} color={Theme.colors.primary} />
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentBody}>
            We sent a password reset link to {getValues('email')}. Check your inbox and follow the
            instructions.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/customer/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnText}>Back to Sign In</Text>
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
        <Text style={styles.title}>Forgot password?</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a link to reset your password.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="your@email.com"
                placeholderTextColor={Theme.colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}
        </View>

        {apiError !== '' && <Text style={styles.apiError}>{apiError}</Text>}

        <TouchableOpacity
          style={[styles.submitBtn, forgotPassword.isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={forgotPassword.isPending}
          activeOpacity={0.8}
        >
          {forgotPassword.isPending ? (
            <ActivityIndicator color={Theme.colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelWrap} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Back to Sign In</Text>
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
  cancelWrap: { alignItems: 'center', marginTop: Theme.spacing.lg },
  cancelText: { color: Theme.colors.primary, fontSize: Theme.fontSize.md, fontWeight: '600' },
  sentContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.xl,
  },
  sentTitle: {
    fontSize: Theme.fontSize.xxl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  sentBody: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Theme.spacing.xl,
  },
  backBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xxl,
    ...Theme.shadow.md,
  },
  backBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
