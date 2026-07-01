import { StyleSheet, View, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StatusBadge } from "@/src/components/shared/status-badge";
import { OrderCarfaxBadge } from "@technician/components/orders/order-carfax-badge";
import { StatusColorMap } from "@technician/constants/colors";
import { AppointmentCarfaxStatus } from "@technician/types/enums";
import type { Appointment } from "@technician/types/api";

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes} ${ampm}`;
}

/**
 * Render the order's `scheduled_date` (or `created_at` fallback) as a
 * short, human-friendly label. Defensively normalizes per
 * `.cursor/rules/datetime-and-data-format-contracts.mdc § 2`: backend
 * `DATE` columns serialize as full ISO timestamps, and rendering them
 * raw produced `2026-05-01T04:00:00.000Z` on the OrderCard.
 *
 * Output:
 *   - "Today" / "Tomorrow" / "Yesterday" when applicable
 *   - "Mon, May 1" within ~30 days
 *   - "May 1, 2027" further out (or different year)
 */
function formatScheduledDate(value: string): string {
  const dayKey = value.length >= 10 ? value.slice(0, 10) : value;
  const [yearStr, monthStr, dayStr] = dayKey.split("-");
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  if (!y || !m || !d) return value;
  const target = new Date(y, m - 1, d);

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dayDelta = Math.round(
    (target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Tomorrow";
  if (dayDelta === -1) return "Yesterday";

  const sameYear = target.getFullYear() === today.getFullYear();
  const withinMonth = Math.abs(dayDelta) <= 30;
  return target.toLocaleDateString("en-US", {
    weekday: withinMonth ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function customerLabel(appt: Appointment): string {
  return (
    appt.customer_name ??
    appt.customer?.full_name ??
    `Customer #${appt.customer_id}`
  );
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

interface OrderCardProps {
  appointment: Appointment;
  onPress: () => void;
  onLongPress?: () => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function OrderCard({
  appointment,
  onPress,
  onLongPress,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
}: OrderCardProps) {
  const borderColor = StatusColorMap[appointment.status];
  const vehicle = appointment.vehicle;
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "No vehicle";

  const dateLabel = formatScheduledDate(
    appointment.scheduled_date ?? appointment.created_at,
  );
  const timeLabel = appointment.scheduled_time
    ? formatTime(appointment.scheduled_time)
    : null;

  const plate = appointment.license_plate ?? appointment.vehicle?.license_plate;
  const mileage = appointment.mileage ?? appointment.vehicle?.mileage;

  const handlePress = () => {
    if (bulkMode) {
      onToggleSelect?.();
    } else {
      onPress();
    }
  };

  return (
    <Pressable
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {bulkMode && (
        <View style={styles.checkboxRow}>
          <MaterialIcons
            name={isSelected ? "check-box" : "check-box-outline-blank"}
            size={24}
            color={isSelected ? "#3B82F6" : "#D1D5DB"}
          />
        </View>
      )}

      <View style={[styles.header, bulkMode && { paddingLeft: 32 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.orderId}>#{appointment.id}</Text>
          <Text style={styles.dateSep}>&middot;</Text>
          <Text style={styles.date}>
            {dateLabel}
            {timeLabel ? ` ${timeLabel}` : ""}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {appointment.tagged_for_review_at ? (
            <View style={styles.reviewBadge}>
              <MaterialIcons name="flag" size={11} color="#6366F1" />
              <Text style={styles.reviewBadgeText}>Review</Text>
            </View>
          ) : null}
          <StatusBadge status={appointment.status} size="small" />
        </View>
      </View>

      <Text style={styles.customer}>{customerLabel(appointment)}</Text>

      <View style={styles.detailRow}>
        <Text style={styles.vehicle}>{vehicleLabel}</Text>
        {plate ? (
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{plate}</Text>
          </View>
        ) : null}
      </View>

      {/* 2026-05-25 — phone + address always render. The card shows an
          italic "Not on file" fallback when either field is empty so
          the tech knows the data is absent (not just hidden by a
          render guard). The BE join already provides `customer_phone`,
          `address_line`, and `address_city` on this list endpoint via
          `buildEnrichedAppointmentQuery`. */}
      <View style={styles.contactRow}>
        <MaterialIcons
          name="phone"
          size={13}
          color={appointment.customer_phone ? "#9CA3AF" : "#D1D5DB"}
        />
        <Text
          style={
            appointment.customer_phone
              ? styles.addressText
              : styles.addressTextMissing
          }
          numberOfLines={1}
        >
          {appointment.customer_phone ?? "Phone not on file"}
        </Text>
      </View>
      <View style={styles.contactRow}>
        <MaterialIcons
          name="place"
          size={13}
          color={
            appointment.address_line || appointment.address_city
              ? "#9CA3AF"
              : "#D1D5DB"
          }
        />
        <Text
          style={
            appointment.address_line || appointment.address_city
              ? styles.addressText
              : styles.addressTextMissing
          }
          numberOfLines={1}
        >
          {appointment.address_line || appointment.address_city
            ? [appointment.address_line, appointment.address_city]
                .filter(Boolean)
                .join(", ")
            : "Address not on file"}
        </Text>
      </View>

      {(mileage || appointment.service_names) && (
        <View style={styles.metaRow}>
          {mileage ? (
            <Text style={styles.metaText}>
              {mileage.toLocaleString()} mi
            </Text>
          ) : null}
          {appointment.service_names ? (
            <Text style={styles.services} numberOfLines={1}>
              {appointment.service_names}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.footer}>
        {appointment.total_amount != null && (
          <Text style={styles.amount}>
            {formatCurrency(appointment.total_amount)}
          </Text>
        )}
        {appointment.pay_status ? (
          <View
            style={[
              styles.payBadge,
              appointment.pay_status === "paid" && styles.payBadgePaid,
            ]}
          >
            <Text
              style={[
                styles.payText,
                appointment.pay_status === "paid" && styles.payTextPaid,
              ]}
            >
              {appointment.pay_status.charAt(0).toUpperCase() +
                appointment.pay_status.slice(1)}
            </Text>
          </View>
        ) : null}
        {appointment.fleet_company_name ? (
          <View style={styles.fleetBadge}>
            <MaterialIcons
              name="local-shipping"
              size={12}
              color="#6366F1"
            />
            <Text style={styles.fleetText}>
              {appointment.fleet_company_name}
            </Text>
          </View>
        ) : null}
      </View>

      {appointment.carfax_status &&
      appointment.carfax_status !== AppointmentCarfaxStatus.NOT_SUBMITTED ? (
        <View style={styles.carfaxRow}>
          <OrderCarfaxBadge
            status={appointment.carfax_status}
            attemptCount={appointment.carfax_attempt_count ?? 0}
            lastError={appointment.carfax_last_error ?? null}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  checkboxRow: {
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reviewBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 0.2,
  },
  orderId: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  dateSep: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  date: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  customer: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  vehicle: {
    fontSize: 14,
    color: "#6B7280",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    color: "#6B7280",
    flex: 1,
  },
  addressTextMissing: {
    fontSize: 13,
    color: "#D1D5DB",
    fontStyle: "italic",
    flex: 1,
  },
  plateBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  plateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  services: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  payBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  payBadgePaid: {
    backgroundColor: "#DCFCE7",
  },
  payText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#EF4444",
  },
  payTextPaid: {
    color: "#22C55E",
  },
  fleetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fleetText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6366F1",
  },
  carfaxRow: {
    marginTop: 6,
  },
});
