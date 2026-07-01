import { AppSheet, type AppSheetRef } from '@technician/components/sheets';
import { BOOKING_METHOD_LABELS } from '@technician/constants/calendar';
import { StatusColorMap } from '@technician/constants/colors';
import {
	useDeleteAppointment,
	useNoShowAppointment,
} from '@technician/hooks/schedule/use-calendar';
import { haptic } from '@technician/hooks/utility/use-haptics';
import type { CalendarAppointmentItem } from '@technician/types/calendar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetScrollView, TouchableOpacity } from '@gorhom/bottom-sheet';
import dayjs from 'dayjs';
import { useRouter } from 'expo-router';
import { forwardRef, useCallback, useMemo } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { SlotTypeIndicator } from './slot-type-indicator';

// P2-FE-5 chunk 2c-prep (2026-04-22): in landscape workweek the full-width
// detail sheet hides ~half the calendar grid for no reason. Caller pins
// the sheet to the *opposite* half from the tapped event so the source
// row stays visible.
//
// LDM-WAVE-2 CHUNK-2 (SHEETS-1): the half-width-on-landscape behavior
// originally implemented inline here is now the canonical default on
// every sheet via `<AppSheet>` from `@technician/components/sheets`. This
// component is migrated to AppSheet and the `side` prop is forwarded
// as `forceSide` for backward compat with the existing caller in
// `app/(tabs)/index.tsx`. The caller is on the upgrade path to pass
// `tapX` instead of computing `side` via day-index math — until that
// land, `side` continues to work.
//
// The original PLAN-DEVIATION (2026-04-22-half-width-detail-sheet)
// described the inline positioned-wrapper workaround; that workaround
// now lives inside `<AppSheet>` as the canonical implementation. The
// deviation is marked Resolved 2026-05-17 in
// docs/PLAN-DEVIATIONS.md.
export type DetailSheetSide = 'left' | 'right' | 'full';

interface AppointmentDetailSheetProps {
	appointment: CalendarAppointmentItem | null;
	onClose: () => void;
	onReschedule: (appt: CalendarAppointmentItem) => void;
	onCancel: (appt: CalendarAppointmentItem) => void;
	onQuickText: (appt: CalendarAppointmentItem) => void;
	onEdit: (appt: CalendarAppointmentItem) => void;
	side?: DetailSheetSide;
}

export const AppointmentDetailSheet = forwardRef<
	AppSheetRef,
	AppointmentDetailSheetProps
>(function AppointmentDetailSheet(
	{
		appointment,
		onClose,
		onReschedule,
		onCancel,
		onQuickText,
		onEdit,
		side = 'full',
	},
	ref
) {
	const router = useRouter();
	const noShowMutation = useNoShowAppointment();
	const deleteMutation = useDeleteAppointment();
	// LDM-WAVE-2 CHUNK-2 (SHEETS-1): portrait snap points; AppSheet
	// ignores these on landscape half-width (uses its [60%,95%] default).
	// The wrapperStyle math + positioned-View workaround that used to
	// live here is now the canonical implementation inside AppSheet.
	const snapPoints = useMemo(() => ['50%', '90%'], []);

	const handleNoShow = useCallback(() => {
		if (!appointment) return;
		Alert.alert('Mark No-Show', 'Mark this customer as a no-show?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Confirm',
				style: 'destructive',
				onPress: () => {
					noShowMutation.mutate(
						{
							id: appointment.id,
							payload: { notify_customer: true },
						},
						{ onSuccess: onClose }
					);
				},
			},
		]);
	}, [appointment, noShowMutation, onClose]);

	// 2026-05-25 — Hard delete for unpaid appointments. Use case is
	// "created by mistake, wipe it from the calendar and orders".
	// Only enabled when the appointment is in a pre-completion
	// status; BE still applies the authoritative `stripe_payments`
	// check and returns 409 if a successful charge exists.
	const handleDelete = useCallback(() => {
		if (!appointment) return;
		Alert.alert(
			'Delete Appointment?',
			'This permanently removes the appointment from the calendar and the order list. This cannot be undone. Use Cancel instead if you want to keep a record.',
			[
				{ text: 'Keep', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						deleteMutation.mutate(appointment.id, {
							onSuccess: onClose,
							onError: (err: unknown) => {
								const msg =
									(
										err as {
											response?: {
												data?: { message?: string };
											};
										}
									)?.response?.data?.message ??
									(err as Error)?.message ??
									'Could not delete appointment.';
								Alert.alert('Delete Failed', msg);
							},
						});
					},
				},
			]
		);
	}, [appointment, deleteMutation, onClose]);

	if (!appointment) return null;

	// 2026-05-25 — Status whitelist for the Delete action. Keeps
	// active jobs and post-completion records protected on the FE
	// side; BE still has the authoritative paid-status guard.
	const DELETABLE_STATUSES = [
		'created',
		'confirmed',
		'accepted',
		'cancelled',
		'no_show',
	];
	const canDelete = DELETABLE_STATUSES.includes(appointment.status);

	const statusColor = StatusColorMap[appointment.status] ?? '#6B7280';
	const svcs = appointment.services ?? [];
	const taxes = appointment.tax_lines ?? [];
	const alerts = appointment.alerts ?? [];
	const serviceList = svcs.map((s) => s.service_name).join(', ');
	const totalAmount = svcs.reduce((sum, s) => sum + s.price * s.quantity, 0);

	return (
		<AppSheet
			ref={ref}
			index={-1}
			forceSide={side}
			defaultSnapPoints={snapPoints}
			enablePanDownToClose
			onClose={onClose}>
			<BottomSheetScrollView contentContainerStyle={styles.content}>
				<View style={styles.topRow}>
					<View
						style={[
							styles.statusBadge,
							{
								backgroundColor: statusColor + '20',
								borderColor: statusColor,
							},
						]}>
						<Text
							style={[styles.statusText, { color: statusColor }]}>
							{appointment.status
								.replace(/_/g, ' ')
								.toUpperCase()}
						</Text>
					</View>
					<SlotTypeIndicator
						slotType={appointment.slot_type}
						size='small'
					/>
				</View>

				<Text style={styles.customerName}>
					{appointment.customer_name}
				</Text>

				{/* 2026-05-25 — phone + address pinned right under the name so a
              tech can see WHERE and HOW to reach the customer without
              scrolling to the Details section. When either is missing,
              show an italic "Not on file" so the absence is explicit
              instead of silently hidden (the previous behavior). */}
				{appointment.customer_phone ? (
					<TouchableOpacity
						style={styles.phoneRow}
						onPress={() =>
							Linking.openURL(`tel:${appointment.customer_phone}`)
						}>
						<MaterialIcons name='phone' size={16} color='#3B82F6' />
						<Text style={styles.phoneText}>
							{appointment.customer_phone}
						</Text>
					</TouchableOpacity>
				) : (
					<View style={styles.phoneRow}>
						<MaterialIcons name='phone' size={16} color='#D1D5DB' />
						<Text style={styles.contactMissingText}>
							Phone not on file
						</Text>
					</View>
				)}

				{(() => {
					// Prefer the FO-entered one-off `location_address` JSONB
					// block when present; otherwise fall back to the joined
					// customer-default address (the common case). Showing
					// "Address not on file" when both are absent makes the gap
					// visible so the operator knows to fix the contact record.
					const oneOff = appointment.location_address;
					const joined =
						appointment.address_line || appointment.address_city
							? [
									appointment.address_line,
									appointment.address_city,
								]
									.filter(Boolean)
									.join(', ')
							: null;
					const text = oneOff
						? `${oneOff.line_1}, ${oneOff.city}`
						: joined;
					if (text) {
						return (
							<View style={styles.addressTopRow}>
								<MaterialIcons
									name='place'
									size={16}
									color='#6B7280'
								/>
								<Text
									style={styles.addressTopText}
									numberOfLines={2}>
									{text}
								</Text>
							</View>
						);
					}
					return (
						<View style={styles.addressTopRow}>
							<MaterialIcons
								name='place'
								size={16}
								color='#D1D5DB'
							/>
							<Text style={styles.contactMissingText}>
								Address not on file
							</Text>
						</View>
					);
				})()}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Services</Text>
					{svcs.map((s) => (
						<View key={s.service_id} style={styles.serviceRow}>
							<Text style={styles.serviceName}>
								{s.service_name}
							</Text>
							<Text style={styles.servicePrice}>
								${(s.price * s.quantity).toFixed(2)}
							</Text>
						</View>
					))}
					{taxes.map((t) => (
						<View key={t.id} style={styles.serviceRow}>
							<Text style={styles.taxLabel}>
								{t.jurisdiction} Tax
							</Text>
							<Text style={styles.taxAmount}>
								${t.amount.toFixed(2)}
							</Text>
						</View>
					))}
					<View style={[styles.serviceRow, styles.totalRow]}>
						<Text style={styles.totalLabel}>Total</Text>
						<Text style={styles.totalAmount}>
							$
							{(
								totalAmount +
								taxes.reduce((s, t) => s + t.amount, 0)
							).toFixed(2)}
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Details</Text>
					{appointment.technician_name && (
						<DetailRow
							icon='person'
							label='Technician'
							value={appointment.technician_name}
						/>
					)}
					<DetailRow
						icon='schedule'
						label='Time'
						value={`${formatTime(appointment.scheduled_time)} • ${svcs.reduce((s, svc) => s + svc.quantity, 0)} service(s)`}
					/>
					<DetailRow
						icon='bookmark'
						label='Booking'
						value={
							BOOKING_METHOD_LABELS[appointment.booking_method] ??
							appointment.booking_method
						}
					/>
					{/* 2026-05-25 — Location row removed from this section. The
                address now lives at the top of the sheet right under the
                customer name + phone, so the tech can see it without
                scrolling. See the address-block render near customerName
                above. */}
				</View>

				{appointment.explanation && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>AI Explanation</Text>
						<Text style={styles.explanation}>
							{appointment.explanation}
						</Text>
					</View>
				)}

				{alerts.length > 0 && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Alerts</Text>
						{alerts.map((alert) => (
							<View key={alert.id} style={styles.alertRow}>
								<View
									style={[
										styles.alertDot,
										{
											backgroundColor:
												alert.severity === 'critical'
													? '#EF4444'
													: '#F59E0B',
										},
									]}
								/>
								<Text style={styles.alertMessage}>
									{alert.message}
								</Text>
							</View>
						))}
					</View>
				)}

				{appointment.appointment_note && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Note</Text>
						<Text style={styles.noteText}>
							{appointment.appointment_note}
						</Text>
					</View>
				)}

				<View style={styles.actions}>
					<ActionButton
						icon='message'
						label='QuickText'
						color='#3B82F6'
						onPress={() => onQuickText(appointment)}
					/>
					<ActionButton
						icon='schedule'
						label='Reschedule'
						color='#F59E0B'
						onPress={() => onReschedule(appointment)}
					/>
					<ActionButton
						icon='edit'
						label='Edit'
						color='#6B7280'
						onPress={() => onEdit(appointment)}
					/>
					<ActionButton
						icon='cancel'
						label='Cancel'
						color='#EF4444'
						onPress={() => onCancel(appointment)}
					/>
				</View>

				<View style={styles.bottomActions}>
					<TouchableOpacity
						style={styles.noShowBtn}
						onPress={handleNoShow}>
						<MaterialIcons
							name='person-off'
							size={18}
							color='#EF4444'
						/>
						<Text style={styles.noShowText}>No-Show</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.viewOrderBtn}
						onPress={() => {
							onClose();
							router.push(`/order/${appointment.id}`);
						}}>
						<Text style={styles.viewOrderText}>View Order</Text>
						<MaterialIcons
							name='chevron-right'
							size={18}
							color='#fff'
						/>
					</TouchableOpacity>
				</View>

				{/* 2026-05-25 — Delete button for accidentally-created
              appointments. Sits below the primary actions because
              it's destructive and rarely used; styled subtly so it
              doesn't compete with the No-Show / View Order pair
              above. Hidden post-completion (BE also refuses). */}
				{canDelete ? (
					<TouchableOpacity
						style={[
							styles.deleteBtn,
							deleteMutation.isPending &&
								styles.deleteBtnDisabled,
						]}
						onPress={handleDelete}
						disabled={deleteMutation.isPending}
						testID='appointment-detail-delete'>
						<MaterialIcons
							name='delete-outline'
							size={16}
							color='#9CA3AF'
						/>
						<Text style={styles.deleteText}>
							{deleteMutation.isPending
								? 'Deleting…'
								: 'Delete appointment'}
						</Text>
					</TouchableOpacity>
				) : null}
			</BottomSheetScrollView>
		</AppSheet>
	);
});

function DetailRow({
	icon,
	label,
	value,
}: {
	icon: string;
	label: string;
	value: string;
}) {
	return (
		<View style={styles.detailRow}>
			<MaterialIcons name={icon as any} size={16} color='#9CA3AF' />
			<Text style={styles.detailLabel}>{label}</Text>
			<Text style={styles.detailValue} numberOfLines={1}>
				{value}
			</Text>
		</View>
	);
}

function ActionButton({
	icon,
	label,
	color,
	onPress,
}: {
	icon: string;
	label: string;
	color: string;
	onPress: () => void;
}) {
	return (
		<TouchableOpacity
			style={styles.actionBtn}
			onPress={() => {
				haptic.light();
				onPress();
			}}>
			<View
				style={[styles.actionIcon, { backgroundColor: color + '15' }]}>
				<MaterialIcons name={icon as any} size={20} color={color} />
			</View>
			<Text style={styles.actionLabel}>{label}</Text>
		</TouchableOpacity>
	);
}

function formatTime(time: string | null): string {
	if (!time) return '--:--';
	const d = dayjs(time.includes('T') ? time : `2000-01-01T${time}`);
	return d.isValid() ? d.format('h:mm A') : time;
}

const styles = StyleSheet.create({
	content: { padding: 20, paddingBottom: 40 },
	topRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginBottom: 12,
	},
	statusBadge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
		borderWidth: 1,
	},
	statusText: { fontSize: 11, fontWeight: '700' },
	customerName: {
		fontSize: 22,
		fontWeight: '800',
		color: '#111827',
		marginBottom: 4,
	},
	phoneRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		marginBottom: 6,
	},
	phoneText: { fontSize: 14, color: '#3B82F6', fontWeight: '500' },
	addressTopRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 6,
		marginBottom: 16,
	},
	addressTopText: {
		fontSize: 14,
		color: '#374151',
		fontWeight: '500',
		flex: 1,
		lineHeight: 19,
	},
	contactMissingText: {
		fontSize: 14,
		color: '#9CA3AF',
		fontStyle: 'italic',
	},
	section: { marginBottom: 20 },
	sectionTitle: {
		fontSize: 13,
		fontWeight: '700',
		color: '#9CA3AF',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 8,
	},
	serviceRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 4,
	},
	serviceName: { fontSize: 14, color: '#374151' },
	servicePrice: { fontSize: 14, fontWeight: '600', color: '#374151' },
	taxLabel: { fontSize: 13, color: '#9CA3AF' },
	taxAmount: { fontSize: 13, color: '#9CA3AF' },
	totalRow: {
		borderTopWidth: 1,
		borderTopColor: '#E5E7EB',
		marginTop: 6,
		paddingTop: 8,
	},
	totalLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
	totalAmount: { fontSize: 15, fontWeight: '700', color: '#111827' },
	detailRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginBottom: 6,
	},
	detailLabel: { fontSize: 13, color: '#9CA3AF', width: 80 },
	detailValue: { fontSize: 14, color: '#374151', flex: 1 },
	explanation: {
		fontSize: 13,
		color: '#6B7280',
		fontStyle: 'italic',
		lineHeight: 18,
	},
	alertRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 8,
		marginBottom: 6,
	},
	alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
	alertMessage: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 18 },
	noteText: { fontSize: 14, color: '#374151', lineHeight: 20 },
	actions: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		marginBottom: 16,
		paddingTop: 8,
		borderTopWidth: 1,
		borderTopColor: '#E5E7EB',
	},
	actionBtn: { alignItems: 'center', gap: 4 },
	actionIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: 'center',
		justifyContent: 'center',
	},
	actionLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
	bottomActions: { flexDirection: 'row', gap: 12 },
	noShowBtn: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 12,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#FCA5A5',
		backgroundColor: '#FEF2F2',
	},
	noShowText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
	viewOrderBtn: {
		flex: 2,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 4,
		paddingVertical: 12,
		borderRadius: 10,
		backgroundColor: '#3B82F6',
	},
	viewOrderText: { fontSize: 14, fontWeight: '600', color: '#fff' },
	// 2026-05-25 — Subtle, low-emphasis affordance for the
	// accidental-create case. Gray on gray so it never reads as a
	// primary action; the destructive Alert dialog is the real safety
	// gate.
	deleteBtn: {
		marginTop: 12,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 10,
		borderRadius: 10,
		backgroundColor: '#F9FAFB',
		borderWidth: 1,
		borderColor: '#E5E7EB',
	},
	deleteBtnDisabled: { opacity: 0.5 },
	deleteText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#6B7280',
	},
});
