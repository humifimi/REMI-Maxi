import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFleetManagerGuard } from '@customer/components/fleet/fleet-manager-guard';
import { Theme } from '@customer/constants/colors';
import { SkeletonBox } from '@customer/components/shared/skeleton';
import { EmptyState } from '@customer/components/shared/empty-state';
import { useFleetSettings, useUpdateFleetSettings } from '@customer/hooks/fleet/use-fleet-settings';
import type {
  FleetSettingsUpdate,
  InspectionFrequency,
  NotificationRecipient,
  SpendPeriod,
} from '@customer/types/fleet';

const INSPECTION_FREQUENCIES: { key: InspectionFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'monthly', label: 'Monthly' },
];

const NOTIFICATION_OPTIONS: { key: NotificationRecipient; label: string; desc: string }[] = [
  { key: 'manager_only', label: 'Manager Only', desc: 'Only the fleet manager receives notifications' },
  { key: 'manager_and_drivers', label: 'Manager + Drivers', desc: 'Both the manager and assigned drivers receive notifications' },
];

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ── Read-Only Info Row ── */
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string | null }) {
  return (
    <View style={infoStyles.row}>
      <View style={infoStyles.iconWrap}>
        <Ionicons name={icon as any} size={18} color={Theme.colors.primary} />
      </View>
      <View style={infoStyles.textWrap}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value}>{value || '—'}</Text>
      </View>
    </View>
  );
}

/* ── Section Card ── */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[sectionStyles.card, Theme.shadow.sm]}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

/* ── Chip Selector ── */
function ChipSelector<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { key: T; label: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          style={[chipStyles.chip, selected === opt.key && chipStyles.chipActive]}
          onPress={() => onSelect(opt.key)}
          activeOpacity={0.7}
        >
          <Text style={[chipStyles.chipText, selected === opt.key && chipStyles.chipTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ── Main Screen ── */
export default function FleetSettingsScreen() {
  const allowed = useFleetManagerGuard();
  const { data: settings, isLoading, isError, refetch } = useFleetSettings();
  const updateMutation = useUpdateFleetSettings();

  const [poNumber, setPoNumber] = useState('');
  const [poRequired, setPoRequired] = useState(false);
  const [notifRecipient, setNotifRecipient] = useState<NotificationRecipient>('manager_only');
  const [inspectionFreq, setInspectionFreq] = useState<InspectionFrequency>('weekly');
  const [budgetTarget, setBudgetTarget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<SpendPeriod>('monthly');
  const [autoApproval, setAutoApproval] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPoNumber(settings.default_po_number ?? '');
    setPoRequired(settings.po_required);
    setNotifRecipient(settings.notification_recipient);
    setInspectionFreq(settings.inspection_frequency);
    setBudgetTarget(settings.budget_target !== null ? String(settings.budget_target) : '');
    setBudgetPeriod(settings.budget_period ?? 'monthly');
    setAutoApproval(settings.auto_approval_threshold !== null ? String(settings.auto_approval_threshold) : '');
  }, [settings]);

  const markDirty = useCallback(() => setHasChanges(true), []);

  const handleSave = useCallback(() => {
    const update: FleetSettingsUpdate = {
      default_po_number: poNumber || null,
      po_required: poRequired,
      notification_recipient: notifRecipient,
      inspection_frequency: inspectionFreq,
      budget_target: budgetTarget ? parseFloat(budgetTarget) : null,
      budget_period: budgetPeriod,
      auto_approval_threshold: autoApproval ? parseFloat(autoApproval) : null,
    };

    updateMutation.mutate(update, {
      onSuccess: () => {
        setHasChanges(false);
        Alert.alert('Settings Updated', 'Fleet settings have been saved.');
      },
      onError: () => {
        Alert.alert('Error', 'Failed to save settings. Please try again.');
      },
    });
  }, [poNumber, poRequired, notifRecipient, inspectionFreq, budgetTarget, budgetPeriod, autoApproval, updateMutation]);

  if (!allowed) return null;

  if (isLoading) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ marginBottom: 16 }}>
            <SkeletonBox width="100%" height={120} borderRadius={16} />
          </View>
        ))}
      </ScrollView>
    );
  }

  if (isError || !settings) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Couldn't load settings"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => refetch()} />
        }
      >
        {/* Company Info (read-only) */}
        <SectionCard title="Company Info">
          <InfoRow icon="business-outline" label="Company Name" value={settings.company_name} />
          <InfoRow icon="person-outline" label="Billing Contact" value={settings.billing_contact_name} />
          <InfoRow icon="mail-outline" label="Email" value={settings.billing_contact_email} />
          <InfoRow icon="call-outline" label="Phone" value={settings.billing_contact_phone} />
        </SectionCard>

        {/* PO Number Preferences */}
        <SectionCard title="PO Number">
          <View style={fieldStyles.row}>
            <Text style={fieldStyles.label}>Default PO Number</Text>
            <TextInput
              style={fieldStyles.input}
              placeholder="e.g. PO-2026"
              placeholderTextColor={Theme.colors.textTertiary}
              value={poNumber}
              onChangeText={(v) => { setPoNumber(v); markDirty(); }}
            />
          </View>
          <View style={fieldStyles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={fieldStyles.label}>PO Required</Text>
              <Text style={fieldStyles.hint}>Require PO number on all fleet bookings</Text>
            </View>
            <Switch
              value={poRequired}
              onValueChange={(v) => { setPoRequired(v); markDirty(); }}
              trackColor={{ false: Theme.colors.border, true: Theme.colors.primary + '60' }}
              thumbColor={poRequired ? Theme.colors.primary : Theme.colors.textTertiary}
            />
          </View>
        </SectionCard>

        {/* Notification Preferences */}
        <SectionCard title="Notifications">
          {NOTIFICATION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                radioStyles.option,
                notifRecipient === opt.key && radioStyles.optionActive,
              ]}
              onPress={() => { setNotifRecipient(opt.key); markDirty(); }}
              activeOpacity={0.7}
            >
              <View style={[radioStyles.circle, notifRecipient === opt.key && radioStyles.circleActive]}>
                {notifRecipient === opt.key && <View style={radioStyles.dot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={radioStyles.label}>{opt.label}</Text>
                <Text style={radioStyles.desc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </SectionCard>

        {/* Inspection Frequency */}
        <SectionCard title="Inspection Frequency">
          <Text style={fieldStyles.hint}>How often drivers should complete their vehicle inspection</Text>
          <ChipSelector
            options={INSPECTION_FREQUENCIES}
            selected={inspectionFreq}
            onSelect={(v) => { setInspectionFreq(v); markDirty(); }}
          />
        </SectionCard>

        {/* Budget Target */}
        <SectionCard title="Budget Target">
          <ChipSelector
            options={[{ key: 'monthly' as SpendPeriod, label: 'Monthly' }, { key: 'quarterly' as SpendPeriod, label: 'Quarterly' }]}
            selected={budgetPeriod}
            onSelect={(v) => { setBudgetPeriod(v); markDirty(); }}
          />
          <View style={fieldStyles.currencyRow}>
            <Text style={fieldStyles.currencySymbol}>$</Text>
            <TextInput
              style={fieldStyles.currencyInput}
              placeholder="5000"
              placeholderTextColor={Theme.colors.textTertiary}
              value={budgetTarget}
              onChangeText={(v) => { setBudgetTarget(v); markDirty(); }}
              keyboardType="numeric"
            />
          </View>
        </SectionCard>

        {/* Auto-Approval Threshold */}
        <SectionCard title="Auto-Approval">
          <Text style={fieldStyles.hint}>
            Automatically approve service requests under this amount. Leave empty to require manual approval for all requests.
          </Text>
          <View style={fieldStyles.currencyRow}>
            <Text style={fieldStyles.currencySymbol}>$</Text>
            <TextInput
              style={fieldStyles.currencyInput}
              placeholder="200"
              placeholderTextColor={Theme.colors.textTertiary}
              value={autoApproval}
              onChangeText={(v) => { setAutoApproval(v); markDirty(); }}
              keyboardType="numeric"
            />
          </View>
          {autoApproval ? (
            <Text style={fieldStyles.previewText}>
              Services under {formatCurrency(parseFloat(autoApproval) || 0)} will be auto-approved
            </Text>
          ) : null}
        </SectionCard>

        {/* Save Button */}
        {hasChanges && (
          <TouchableOpacity
            style={[styles.saveBtn, updateMutation.isPending && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.7}
            disabled={updateMutation.isPending}
          >
            <Ionicons name="checkmark" size={20} color={Theme.colors.white} />
            <Text style={styles.saveBtnText}>
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Demo badge */}
        <View style={styles.demoBadgeRow}>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Fleet Settings — Mock Data (BE-24)</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ── */

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Theme.colors.background },
  content: { padding: Theme.spacing.md, paddingBottom: Theme.spacing.xxl + Theme.spacing.xl },
  emptyWrap: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: 16,
    marginTop: Theme.spacing.lg,
    minHeight: 52,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Theme.spacing.xl,
  },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
});

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    marginBottom: Theme.spacing.md,
  },
  title: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: { flex: 1 },
  label: { fontSize: Theme.fontSize.xs, fontWeight: '500', color: Theme.colors.textTertiary },
  value: { fontSize: Theme.fontSize.md, fontWeight: '600', color: Theme.colors.text, marginTop: 1 },
});

const fieldStyles = StyleSheet.create({
  row: { marginBottom: Theme.spacing.md },
  label: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.xs,
  },
  hint: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    marginBottom: Theme.spacing.sm,
    lineHeight: 17,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 12,
    fontSize: Theme.fontSize.md,
    color: Theme.colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Theme.spacing.sm,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: Theme.spacing.md,
    marginTop: Theme.spacing.sm,
  },
  currencySymbol: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  currencyInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: Theme.spacing.xs,
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  previewText: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textSecondary,
    marginTop: Theme.spacing.sm,
    fontStyle: 'italic',
  },
});

const chipStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  chipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  chipText: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  chipTextActive: { color: Theme.colors.white },
});

const radioStyles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    paddingVertical: Theme.spacing.sm + 2,
    paddingHorizontal: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    marginBottom: Theme.spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionActive: {
    backgroundColor: Theme.colors.primary + '08',
    borderColor: Theme.colors.primary + '30',
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleActive: { borderColor: Theme.colors.primary },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.colors.primary,
  },
  label: { fontSize: Theme.fontSize.sm, fontWeight: '600', color: Theme.colors.text },
  desc: { fontSize: Theme.fontSize.xs, color: Theme.colors.textSecondary, marginTop: 1 },
});
