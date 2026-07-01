import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { Theme } from '@customer/constants/colors';
import {
  usePaymentMethods,
  useDeletePaymentMethod,
  useCreateSetupIntent,
} from '@customer/hooks/payments/use-payments';
import type { StripePaymentMethod } from '@customer/types/api';

const BRAND_ICONS: Record<string, string> = {
  visa: 'card-outline',
  mastercard: 'card-outline',
  amex: 'card-outline',
  discover: 'card-outline',
};

function brandDisplay(brand: string): string {
  const names: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };
  return names[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

function CardRow({
  method,
  onDelete,
  deleting,
}: {
  method: StripePaymentMethod;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const card = method.card;
  if (!card) return null;

  return (
    <View style={styles.cardRow}>
      <View style={styles.cardIconWrap}>
        <Ionicons
          name={(BRAND_ICONS[card.brand] ?? 'card-outline') as any}
          size={24}
          color={Theme.colors.primary}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardBrand}>{brandDisplay(card.brand)}</Text>
        <Text style={styles.cardDetails}>
          •••• {card.last4}  ·  {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(method.id)}
        hitSlop={12}
        disabled={deleting}
        style={styles.deleteBtn}
      >
        {deleting ? (
          <ActivityIndicator size="small" color={Theme.colors.error} />
        ) : (
          <Ionicons name="trash-outline" size={20} color={Theme.colors.error} />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function PaymentMethodsScreen() {
  const { data: methods, isPending, refetch } = usePaymentMethods();
  const deleteMutation = useDeletePaymentMethod();
  const setupIntent = useCreateSetupIntent();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [addingCard, setAddingCard] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('Remove Card', 'Are you sure you want to remove this card?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(id);
            try {
              await deleteMutation.mutateAsync(id);
            } catch {
              Alert.alert('Error', 'Could not remove card. Please try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]);
    },
    [deleteMutation],
  );

  const handleAddCard = useCallback(async () => {
    setAddingCard(true);
    try {
      const result = await setupIntent.mutateAsync();

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: result.setupIntentSecret,
        customerEphemeralKeySecret: result.ephemeralKey,
        merchantDisplayName: 'REMI Service',
        returnURL: 'remicustomer://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        Alert.alert('Setup Error', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Error', presentError.message);
        }
        return;
      }

      refetch();
    } catch {
      Alert.alert('Connection Error', 'Could not connect to payment service. Please try again.');
    } finally {
      setAddingCard(false);
    }
  }, [setupIntent, initPaymentSheet, presentPaymentSheet, refetch]);

  const renderItem = useCallback(
    ({ item }: { item: StripePaymentMethod }) => (
      <CardRow
        method={item}
        onDelete={handleDelete}
        deleting={deletingId === item.id}
      />
    ),
    [handleDelete, deletingId],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : !methods?.length ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="card-outline" size={48} color={Theme.colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No cards saved</Text>
          <Text style={styles.emptySubtitle}>
            Add a payment method for seamless checkout after service.
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={handleAddCard}
            disabled={addingCard}
            activeOpacity={0.85}
          >
            {addingCard ? (
              <ActivityIndicator color={Theme.colors.white} />
            ) : (
              <Text style={styles.emptyAddBtnText}>Add Card</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={methods}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addCardRow}
              onPress={handleAddCard}
              disabled={addingCard}
              activeOpacity={0.8}
            >
              {addingCard ? (
                <ActivityIndicator size="small" color={Theme.colors.primary} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={22} color={Theme.colors.primary} />
                  <Text style={styles.addCardText}>Add new card</Text>
                </>
              )}
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.xl,
  },
  list: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xxl,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.sm,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardBrand: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  cardDetails: {
    fontSize: Theme.fontSize.sm,
    color: Theme.colors.textSecondary,
  },
  deleteBtn: {
    padding: Theme.spacing.sm,
  },
  separator: {
    height: Theme.spacing.sm,
  },
  addCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.lg,
    marginTop: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Theme.colors.primary + '40',
    backgroundColor: Theme.colors.primary + '06',
  },
  addCardText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
    ...Theme.shadow.sm,
  },
  emptyTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: Theme.fontSize.md,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: Theme.spacing.xl,
  },
  emptyAddBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.lg,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xxl,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
});
