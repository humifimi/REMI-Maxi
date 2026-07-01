import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '@customer/constants/colors';
import { BookingAddressListSkeleton } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useAddresses, useAddAddress } from '@customer/hooks/utility/use-addresses';
import { useBookingStore } from '@/src/stores/customer/booking';
// @demo-start
import { useDemoAddressStore } from '@/src/stores/customer/demo-addresses';
// @demo-end
import type { Address } from '@customer/types/api';

const addressFormSchema = z.object({
  address_line: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'Use 2-letter state').max(2, 'Use 2-letter state'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
});

type AddressForm = z.infer<typeof addressFormSchema>;

function formatAddressLine(a: Address): string {
  return `${a.address_line}, ${a.city}, ${a.state} ${a.zip}`;
}

export default function SelectAddressScreen() {
  const router = useRouter();
  const { data: addresses, isPending, isError, refetch } = useAddresses();
  const addAddress = useAddAddress();
  const selectedAddress = useBookingStore((s) => s.selectedAddress);
  const setAddress = useBookingStore((s) => s.setAddress);

  const { control, handleSubmit, formState: { errors } } = useForm<AddressForm>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: { address_line: '', city: '', state: '', zip: '' },
  });

  const onAddNew = (form: AddressForm) => {
    addAddress.mutate(
      {
        address_line: form.address_line.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip: form.zip.trim(),
      },
      {
        onSuccess: (created) => {
          setAddress(created);
          // @demo-start — track so demo reset can delete it
          useDemoAddressStore.getState().trackApiAddress(created.id);
          // @demo-end
          Alert.alert('Address saved', 'Your new address has been added.');
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === 'object' && 'response' in err
              ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? '')
              : '';
          Alert.alert('Could not save address', msg || 'Please try again.');
        },
      }
    );
  };

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <BookingAddressListSkeleton />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          title="Couldn’t load addresses"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  const list = addresses ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>Where should we meet you?</Text>

          <Text style={styles.sectionLabel}>Saved addresses</Text>
          {list.length === 0 ? (
            <View style={styles.hintCard}>
              <Text style={styles.hintText}>No saved addresses yet. Add one below or pick after saving.</Text>
            </View>
          ) : (
            list.map((addr) => {
              const active = selectedAddress?.id === addr.id;
              return (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addrCard, active && styles.addrCardActive]}
                  onPress={() => setAddress(addr)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="location-outline"
                    size={22}
                    color={active ? Theme.colors.primary : Theme.colors.textSecondary}
                    style={styles.addrIcon}
                  />
                  <View style={styles.addrBody}>
                    <Text style={[styles.addrTitle, active && styles.addrTitleActive]} numberOfLines={2}>
                      {formatAddressLine(addr)}
                    </Text>
                    {addr.is_default ? <Text style={styles.defaultBadge}>Default</Text> : null}
                  </View>
                  <View style={[styles.radio, active && styles.radioSelected]}>
                    {active ? <Ionicons name="checkmark" size={16} color={Theme.colors.white} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Add new address</Text>
          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.label}>Street</Text>
              <Controller
                control={control}
                name="address_line"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.address_line && styles.inputError]}
                    placeholder="123 Main St"
                    placeholderTextColor={Theme.colors.textTertiary}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                  />
                )}
              />
              {errors.address_line ? <Text style={styles.errorText}>{errors.address_line.message}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>City</Text>
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.city && styles.inputError]}
                    placeholder="City"
                    placeholderTextColor={Theme.colors.textTertiary}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                  />
                )}
              />
              {errors.city ? <Text style={styles.errorText}>{errors.city.message}</Text> : null}
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>State</Text>
                <Controller
                  control={control}
                  name="state"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.state && styles.inputError]}
                      placeholder="TX"
                      placeholderTextColor={Theme.colors.textTertiary}
                      autoCapitalize="characters"
                      maxLength={2}
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
                {errors.state ? <Text style={styles.errorText}>{errors.state.message}</Text> : null}
              </View>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>ZIP</Text>
                <Controller
                  control={control}
                  name="zip"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.zip && styles.inputError]}
                      placeholder="78701"
                      placeholderTextColor={Theme.colors.textTertiary}
                      keyboardType="numbers-and-punctuation"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                  )}
                />
                {errors.zip ? <Text style={styles.errorText}>{errors.zip.message}</Text> : null}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, addAddress.isPending && styles.saveBtnDisabled]}
              onPress={handleSubmit(onAddNew)}
              disabled={addAddress.isPending}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>{addAddress.isPending ? 'Saving…' : 'Save address'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.continueBtn, !selectedAddress && styles.continueBtnDisabled]}
            disabled={!selectedAddress}
            onPress={() => router.push('/customer/booking/smart-suggestions')}
            activeOpacity={0.85}
          >
            <Text style={styles.continueText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  lead: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  sectionLabel: {
    fontSize: Theme.fontSize.xs,
    fontWeight: '700',
    color: Theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.sm,
  },
  sectionSpaced: {
    marginTop: Theme.spacing.xl,
  },
  hintCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  hintText: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
    lineHeight: 20,
  },
  addrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    ...Theme.shadow.sm,
  },
  addrCardActive: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary + '08',
  },
  addrIcon: {
    marginRight: Theme.spacing.sm,
  },
  addrBody: {
    flex: 1,
    minWidth: 0,
  },
  addrTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    lineHeight: 22,
  },
  addrTitleActive: {
    color: Theme.colors.primary,
  },
  defaultBadge: {
    marginTop: 4,
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontWeight: '600',
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Theme.spacing.sm,
  },
  radioSelected: {
    borderColor: Theme.colors.primary,
    backgroundColor: Theme.colors.primary,
  },
  formCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  field: {
    marginBottom: Theme.spacing.md,
  },
  fieldHalf: {
    flex: 1,
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  input: {
    backgroundColor: Theme.colors.background,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  inputError: {
    borderColor: Theme.colors.error,
  },
  errorText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.error,
    marginTop: Theme.spacing.xs,
  },
  saveBtn: {
    backgroundColor: Theme.colors.text,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.borderLight,
    backgroundColor: Theme.colors.background,
  },
  continueBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    backgroundColor: Theme.colors.border,
  },
  continueText: {
    color: Theme.colors.white,
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
  },
});
