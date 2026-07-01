import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Theme } from '@customer/constants/colors';
import { useCarfaxExport } from '@customer/hooks/use-carfax';
import { useThemeStore } from '@/src/stores/customer-theme';
import type { AxiosError } from 'axios';

interface Props {
  vehicleId: number;
}

const FIVE_YEARS_DAYS = 5 * 365 + 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateForApi(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function describeError(error: Error): string {
  const status = (error as AxiosError | undefined)?.response?.status;
  if (status === 429) return 'You have reached the daily export limit. Try again tomorrow.';
  if (status === 404) return 'This vehicle was not found in your garage.';
  if (status === 400) return 'The selected date range is invalid.';
  if (status === 502) return 'The records service is temporarily unavailable. Please try again.';
  return error.message || 'Could not export service records.';
}

export function CarfaxExportButton({ vehicleId }: Props) {
  const themeColors = useThemeStore((s) => s.colors);
  const carfaxExport = useCarfaxExport(vehicleId);

  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  });
  const [endDate, setEndDate] = useState(() => new Date());
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');

  function handleExport() {
    if (startDate > endDate) {
      Alert.alert('Invalid Range', 'Start date must be on or before end date.');
      return;
    }
    if ((endDate.getTime() - startDate.getTime()) / DAY_MS > FIVE_YEARS_DAYS) {
      Alert.alert('Range Too Large', 'Date range cannot exceed 5 years.');
      return;
    }

    carfaxExport.mutate(
      {
        startDate: formatDateForApi(startDate),
        endDate: formatDateForApi(endDate),
      },
      {
        onSuccess: (result) => {
          setIsOpen(false);
          if (result.empty) {
            Alert.alert(
              'No Service Records',
              'There are no service records in the selected date range.',
            );
          }
        },
        onError: (error) => {
          Alert.alert('Export Failed', describeError(error));
        },
      },
    );
  }

  if (!isOpen) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: themeColors.primary + '10',
              borderColor: themeColors.primary + '30',
            },
          ]}
          onPress={() => setIsOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="download-outline" size={20} color={themeColors.primary} />
          <Text style={[styles.buttonText, { color: themeColors.primary }]}>
            Download Service Records
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pickerCard}>
        <Text style={styles.pickerTitle}>Export Date Range</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={[
              styles.dateBtn,
              activeField === 'start' && { borderColor: themeColors.primary },
            ]}
            onPress={() => setActiveField('start')}
          >
            <Text style={styles.dateLabel}>From</Text>
            <Text style={styles.dateValue}>{formatDateLabel(startDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dateBtn,
              activeField === 'end' && { borderColor: themeColors.primary },
            ]}
            onPress={() => setActiveField('end')}
          >
            <Text style={styles.dateLabel}>To</Text>
            <Text style={styles.dateValue}>{formatDateLabel(endDate)}</Text>
          </TouchableOpacity>
        </View>
        <DateTimePicker
          value={activeField === 'start' ? startDate : endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(_e, date) => {
            if (!date) return;
            if (activeField === 'start') setStartDate(date);
            else setEndDate(date);
          }}
          style={styles.datePicker}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setIsOpen(false)}
            disabled={carfaxExport.isPending}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleExport}
            disabled={carfaxExport.isPending}
            activeOpacity={0.85}
          >
            {carfaxExport.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.exportText}>Export</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Theme.spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.md,
    borderWidth: 1,
    gap: Theme.spacing.sm,
    minHeight: 48,
  },
  buttonText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
  },
  pickerCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.borderLight,
    ...Theme.shadow.md,
  },
  pickerTitle: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: Theme.spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  dateBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.md,
    paddingVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
  },
  dateLabel: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: Theme.fontSize.sm,
    fontWeight: '600',
    color: Theme.colors.text,
    marginTop: 2,
  },
  datePicker: {
    height: 150,
    marginBottom: Theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    minHeight: 48,
  },
  cancelText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  exportBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    minHeight: 48,
  },
  exportText: {
    fontSize: Theme.fontSize.md,
    fontWeight: '700',
    color: Theme.colors.white,
  },
});
