import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';
import { useRegister } from '@customer/hooks/auth/use-auth';

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(10, 'Enter a valid phone number').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const registerMutation = useRegister();
  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', email: '', phone: '', password: '' },
  });

  const onSubmit = (data: RegisterForm) => {
    registerMutation.mutate(
      { ...data, phone: data.phone || undefined },
      {
        onSuccess: () => {
          router.replace('/customer/(onboarding)/welcome');
        },
        onError: (error: any) => {
          let msg = error?.response?.data?.message ?? error?.message ?? 'Registration failed';
          try {
            const parsed = JSON.parse(msg);
            if (Array.isArray(parsed)) {
              msg = parsed.map((e: any) => e.message).join('\n');
            }
          } catch {
            // Already a plain string
          }
          Alert.alert('Registration Failed', msg);
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join {Brand.appName} for premium mobile vehicle service</Text>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <Controller
                  control={control}
                  name="full_name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.full_name && styles.inputError]}
                      placeholder="John Doe"
                      placeholderTextColor={Theme.colors.textTertiary}
                      autoCapitalize="words"
                      returnKeyType="next"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
                {errors.full_name && <Text style={styles.errorText}>{errors.full_name.message}</Text>}
              </View>

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
                      returnKeyType="next"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
                {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Phone (optional)</Text>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={styles.input}
                      placeholder="(555) 123-4567"
                      placeholderTextColor={Theme.colors.textTertiary}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.password && styles.inputError]}
                      placeholder="Create a password"
                      placeholderTextColor={Theme.colors.textTertiary}
                      secureTextEntry
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit(onSubmit)}
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
                {errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}
              </View>

              <TouchableOpacity
                style={[styles.submitButton, registerMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleSubmit(onSubmit)}
                disabled={registerMutation.isPending}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonText}>
                  {registerMutation.isPending ? 'Creating account...' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtons}>
              <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xxl,
    flexGrow: 1,
  },
  title: { fontSize: Theme.fontSize.xxxl, fontWeight: '700', color: Theme.colors.text, marginTop: Theme.spacing.md },
  subtitle: { fontSize: Theme.fontSize.md, color: Theme.colors.textSecondary, marginTop: Theme.spacing.xs, marginBottom: Theme.spacing.lg },
  form: { gap: Theme.spacing.md },
  field: { gap: 4 },
  label: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: Theme.colors.text },
  input: {
    borderWidth: 1.5, borderColor: Theme.colors.border, borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md, paddingVertical: 14, fontSize: Theme.fontSize.md, color: Theme.colors.text,
    backgroundColor: Theme.colors.surface,
  },
  inputError: { borderColor: Theme.colors.error },
  errorText: { fontSize: Theme.fontSize.xs, color: Theme.colors.error },
  submitButton: {
    backgroundColor: Theme.colors.primary, paddingVertical: 16, borderRadius: Theme.borderRadius.lg,
    alignItems: 'center', marginTop: Theme.spacing.sm,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: Theme.colors.white, fontSize: Theme.fontSize.lg, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Theme.spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Theme.colors.border },
  dividerText: { paddingHorizontal: Theme.spacing.md, fontSize: Theme.fontSize.sm, color: Theme.colors.textTertiary },
  socialButtons: { flexDirection: 'row', gap: Theme.spacing.sm },
  socialButton: {
    flex: 1, borderWidth: 1.5, borderColor: Theme.colors.border, borderRadius: Theme.borderRadius.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  socialButtonText: { fontSize: Theme.fontSize.md, fontWeight: '600', color: Theme.colors.text },
});
