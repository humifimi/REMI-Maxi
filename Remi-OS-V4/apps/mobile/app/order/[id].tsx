import { OrderNoteSheet } from '@technician/components/order/order-note-sheet';
import { CarfaxStatusBadge } from '@/src/components/shared/carfax-status-badge';
import { SkeletonOrderDetail } from '@/src/components/shared/skeleton';
import { StatusBadge } from '@/src/components/shared/status-badge';
import { StatusColorMap } from '@technician/constants/colors';
import { useActiveJobBlocker } from '@technician/hooks/jobs/use-active-job-blocker';
import {
	useJobDetail,
	useReportCarfax,
	useRetryCarfax,
} from '@technician/hooks/jobs/use-jobs';
import {
	useAppointmentDetail,
	useDeleteAppointment,
} from '@technician/hooks/schedule/use-calendar';
import { haptic } from '@technician/hooks/utility/use-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { useJobFlowStore } from '@technician/stores/job-flow';
import { UserRole } from '@technician/types/enums';
import { openMapsNavigation } from '@technician/utils/navigation';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';

export default function OrderDetailScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();
	const jobId = parseInt(id, 10);
	const { data, isLoading } = useJobDetail(jobId);
	const retryCarfax = useRetryCarfax();
	const reportCarfax = useReportCarfax();
	// 2026-05-25 — Hard-delete for accidentally-created appointments.
	// BE refuses if a successful stripe payment exists or the
	// appointment is completed/paid; the FE additionally gates the
	// button on `status` so it never appears for active or finished
	// jobs.
	const deleteAppointment = useDeleteAppointment();
	// 2026-04-25 fix: FOs tapping an intent card on Pending Reality land
	// here, but `useJobDetail` hits a technician endpoint they can't
	// reach. Fall back to the franchise calendar appointment endpoint so
	// we can still render a minimal read-only summary instead of a
	// blank "Order not found" page. Same query key as
	// `useIntentDisplayLookup` → cached after the lookup runs.
	const role = useAuthStore((s) => s.user?.role);
	const isFranchiseOwner = role === UserRole.FRANCHISE_OWNER;
	const apptFallback = useAppointmentDetail(
		isFranchiseOwner && !data ? jobId : 0
	);
	const fallbackAppt = apptFallback.data ?? null;
	// D2P-FE-4 — controls the OrderNoteSheet conditional mount on this
	// detail screen. Hoisted above the early-returns to satisfy
	// rules-of-hooks. The sheet is a self-controlled native
	// `<Modal presentationStyle="pageSheet">` — no ref / no snap.
	// See OrderNoteSheet docblock for the v1–v3 attempts that failed.
	const [noteSheetOpen, setNoteSheetOpen] = useState(false);
	// PLAN-DEVIATION: 2026-04-26-active-job-blocker — see docs/PLAN-DEVIATIONS.md.
	const blocker = useActiveJobBlocker();

	// 2026-04-25 fix: always render `<Stack.Screen>` so the header title
	// resolves to `Order #${jobId}` instead of falling back to the literal
	// route segment "[id]" while data is loading or when the order can't
	// be found. Previously the header `<Stack.Screen>` only mounted in the
	// success branch, which left the loading + 404 paths with no title.
	const headerOptions = {
		title: jobId > 0 ? `Order #${jobId}` : 'Order',
		headerLeft: () => (
			<Pressable onPress={() => router.back()} hitSlop={8}>
				<MaterialIcons name='arrow-back' size={24} color='#fff' />
			</Pressable>
		),
	};

	if (isLoading || (isFranchiseOwner && !data && apptFallback.isLoading)) {
		return (
			<>
				<Stack.Screen options={headerOptions} />
				<SkeletonOrderDetail />
			</>
		);
	}

	if (!data && fallbackAppt) {
		return (
			<>
				<Stack.Screen options={headerOptions} />
				<FranchiseAppointmentSummary
					appt={fallbackAppt}
					router={router}
				/>
			</>
		);
	}

	if (!data) {
		return (
			<>
				<Stack.Screen options={headerOptions} />
				<View style={styles.center}>
					<Text style={styles.emptyText}>Order not found</Text>
				</View>
			</>
		);
	}

	const { appointment, services, carfax, notes } = data;
	const borderColor = StatusColorMap[appointment.status];
	const notesList = notes ?? [];

	return (
		<>
			<Stack.Screen
				options={{
					title: `Order #${appointment.id}`,
					headerLeft: () => (
						<Pressable onPress={() => router.back()} hitSlop={8}>
							<MaterialIcons
								name='arrow-back'
								size={24}
								color='#fff'
							/>
						</Pressable>
					),
				}}
			/>
			<ScrollView style={styles.container}>
				<View style={[styles.card, { borderLeftColor: borderColor }]}>
					<View style={styles.row}>
						<Text style={styles.label}>Status</Text>
						<StatusBadge status={appointment.status} />
					</View>
					{appointment.customer?.full_name ? (
						<>
							<View style={styles.row}>
								<Text style={styles.label}>Customer</Text>
								<Text style={styles.value}>
									{appointment.customer.full_name}
								</Text>
							</View>
							<Pressable
								style={styles.viewProfileBtn}
								onPress={() =>
									router.push(
										`/customers/${appointment.customer_id}` as never
									)
								}>
								<MaterialIcons
									name='person'
									size={18}
									color='#3B82F6'
								/>
								<Text style={styles.viewProfileText}>
									View Customer Profile
								</Text>
								<MaterialIcons
									name='chevron-right'
									size={20}
									color='#3B82F6'
								/>
							</Pressable>
						</>
					) : null}
					{appointment.vehicle ? (
						<View style={styles.row}>
							<Text style={styles.label}>Vehicle</Text>
							<Text style={styles.value}>
								{[
									appointment.vehicle.year,
									appointment.vehicle.make,
									appointment.vehicle.model,
								]
									.filter(Boolean)
									.join(' ')}
							</Text>
						</View>
					) : null}
					<View style={styles.row}>
						<Text style={styles.label}>Date</Text>
						<Text style={styles.value}>
							{appointment.scheduled_date
								? new Date(
										appointment.scheduled_date
									).toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									})
								: 'Walk-in'}
						</Text>
					</View>
					<View style={styles.row}>
						<Text style={styles.label}>Time</Text>
						<Text style={styles.value}>
							{appointment.scheduled_time ?? '—'}
						</Text>
					</View>
					{appointment.address_line || appointment.address_city ? (
						<>
							<View style={styles.row}>
								<Text style={styles.label}>Location</Text>
								<Text
									style={[
										styles.value,
										{ flexShrink: 1, textAlign: 'right' },
									]}>
									{[
										appointment.address_line,
										appointment.address_city,
									]
										.filter(Boolean)
										.join(', ')}
								</Text>
							</View>
							<Pressable
								style={styles.navigateBtn}
								onPress={() => {
									haptic.light();
									const addr = [
										appointment.address_line,
										appointment.address_city,
									]
										.filter(Boolean)
										.join(', ');
									openMapsNavigation(
										addr,
										appointment.address_lat,
										appointment.address_lng
									);
								}}>
								<MaterialIcons
									name='navigation'
									size={18}
									color='#3B82F6'
								/>
								<Text style={styles.navigateText}>
									Navigate
								</Text>
								<MaterialIcons
									name='chevron-right'
									size={20}
									color='#3B82F6'
								/>
							</Pressable>
						</>
					) : null}
					{appointment.notes ? (
						<View style={styles.row}>
							<Text style={styles.label}>Notes</Text>
							<Text style={styles.value}>
								{appointment.notes}
							</Text>
						</View>
					) : null}
					{carfax ? (
						<View style={styles.carfaxRow}>
							<Text style={styles.label}>CARFAX</Text>
							<CarfaxStatusBadge
								status={carfax.status}
								errorReason={carfax.error_reason}
								onRetry={() =>
									retryCarfax.mutate(appointment.id)
								}
								isRetrying={retryCarfax.isPending}
								mode={carfax.mode}
								dryRun={carfax.dry_run}
							/>
						</View>
					) : null}
					{/* Manual "Report to Carfax" — visible whenever the technician
              should be able to (re)submit a service record. The backend
              decides whether the call goes live or writes a dry-run file
              based on CARFAX_REPORT_MODE; the success toast reports back. */}
					{(() => {
						const status = appointment.status;
						const eligibleForReport =
							status === 'completed' ||
							status === 'paid' ||
							status === 'in_progress' ||
							status === 'wrap_up';
						const needsReport =
							!carfax ||
							carfax.status === 'n/a' ||
							carfax.status === 'failed';
						if (!eligibleForReport || !needsReport) return null;
						return (
							<Pressable
								style={[
									styles.carfaxReportBtn,
									reportCarfax.isPending &&
										styles.carfaxReportBtnDisabled,
								]}
								disabled={reportCarfax.isPending}
								onPress={() => {
									haptic.medium();
									reportCarfax.mutate(appointment.id, {
										onSuccess: (res) => {
											const dryRun =
												res?.report?.dry_run === true;
											Alert.alert(
												dryRun
													? 'Dry-Run Saved'
													: 'Reported to CARFAX',
												res?.message ??
													(dryRun
														? 'Service record was generated locally. Nothing was sent to CARFAX.'
														: 'Service record was reported to CARFAX.')
											);
										},
										onError: (err: unknown) => {
											const msg =
												(
													err as {
														response?: {
															data?: {
																message?: string;
															};
														};
													}
												)?.response?.data?.message ??
												(err as Error)?.message ??
												'Failed to report to CARFAX.';
											Alert.alert(
												'Could not report',
												msg
											);
										},
									});
								}}>
								{reportCarfax.isPending ? (
									<ActivityIndicator size={16} color='#fff' />
								) : (
									<MaterialIcons
										name='send'
										size={16}
										color='#fff'
									/>
								)}
								<Text style={styles.carfaxReportBtnText}>
									{reportCarfax.isPending
										? 'Reporting…'
										: carfax?.status === 'failed'
											? 'Re-report to CARFAX'
											: 'Report to CARFAX'}
								</Text>
							</Pressable>
						);
					})()}
				</View>

				{(appointment.status === 'en_route' ||
					appointment.status === 'arrived' ||
					appointment.status === 'in_progress' ||
					appointment.status === 'wrap_up') && (
					<Pressable
						style={styles.continueJobBtn}
						onPress={() => {
							haptic.medium();
							useJobFlowStore
								.getState()
								.setScheduledServiceNames(
									appointment.service_names ?? null
								);
							router.push(
								`/job/${appointment.id}/briefing` as never
							);
						}}>
						<MaterialIcons
							name='play-arrow'
							size={22}
							color='#fff'
						/>
						<Text style={styles.continueJobText}>Continue Job</Text>
					</Pressable>
				)}

				{(appointment.status === 'created' ||
					appointment.status === 'confirmed' ||
					appointment.status === 'accepted') && (
					<Pressable
						style={styles.startJobBtn}
						onPress={() => {
							haptic.medium();
							if (blocker.isActive) {
								router.push(blocker.resumeRoute as never);
								return;
							}
							useJobFlowStore
								.getState()
								.setScheduledServiceNames(
									appointment.service_names ?? null
								);
							router.push(
								`/job/${appointment.id}/briefing` as never
							);
						}}>
						<MaterialIcons
							name='play-arrow'
							size={22}
							color='#fff'
						/>
						<Text style={styles.startJobBtnText}>
							{blocker.label}
						</Text>
					</Pressable>
				)}

				<View style={styles.notesHeader}>
					<Text style={styles.sectionTitle}>Notes</Text>
					<Pressable
						style={styles.addNoteBtn}
						onPress={() => {
							haptic.light();
							setNoteSheetOpen(true);
						}}
						hitSlop={8}>
						<MaterialIcons
							name='note-add'
							size={18}
							color='#3B82F6'
						/>
						<Text style={styles.addNoteBtnText}>Add Note</Text>
					</Pressable>
				</View>
				{notesList.length === 0 ? (
					<Text style={styles.notesEmptyHint}>
						No notes yet. Tap Add Note to leave one for franchise
						review.
					</Text>
				) : (
					<View style={styles.notesList}>
						{notesList.map((n) => (
							<View key={n.id} style={styles.noteRow}>
								<Text style={styles.noteBody}>{n.note}</Text>
								<Text style={styles.noteMeta}>
									{new Date(n.created_at).toLocaleString(
										'en-US',
										{
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
										}
									)}
								</Text>
							</View>
						))}
					</View>
				)}

				<Text style={styles.sectionTitle}>Services</Text>
				{services.length === 0 ? (
					<Text style={styles.emptyText}>No services added yet</Text>
				) : (
					services.map((svc) => (
						<View key={svc.id} style={styles.serviceRow}>
							<Text style={styles.serviceName}>
								{svc.service?.name ??
									`Service #${svc.service_id}`}
							</Text>
							<Text style={styles.servicePrice}>
								${Number(svc.price).toFixed(2)}
							</Text>
						</View>
					))
				)}

				{/* 2026-05-25 — Delete option for accidentally-created
            orders. Gated to pre-completion + non-paid statuses.
            Subtly styled so it never competes with the Continue/
            Start Job primary CTAs above. BE still applies the
            authoritative stripe_payments check. */}
				{(() => {
					const DELETABLE_STATUSES = [
						'created',
						'confirmed',
						'accepted',
						'cancelled',
						'no_show',
					];
					if (!DELETABLE_STATUSES.includes(appointment.status))
						return null;
					return (
						<Pressable
							style={[
								styles.deleteOrderBtn,
								deleteAppointment.isPending &&
									styles.deleteOrderBtnDisabled,
							]}
							disabled={deleteAppointment.isPending}
							onPress={() => {
								haptic.medium();
								Alert.alert(
									'Delete Order?',
									'This permanently removes the order from the calendar and the order list. This cannot be undone. Use Cancel instead if you want to keep a record.',
									[
										{ text: 'Keep', style: 'cancel' },
										{
											text: 'Delete',
											style: 'destructive',
											onPress: () => {
												deleteAppointment.mutate(
													appointment.id,
													{
														onSuccess: () => {
															// Pop back to the previous screen
															// (orders / calendar) so the deleted
															// row isn't left behind on a 404
															// detail page.
															if (
																router.canGoBack()
															) {
																router.back();
															} else {
																router.replace(
																	'/(tabs)/orders' as never
																);
															}
														},
														onError: (
															err: unknown
														) => {
															const msg =
																(
																	err as {
																		response?: {
																			data?: {
																				message?: string;
																			};
																		};
																	}
																)?.response
																	?.data
																	?.message ??
																(err as Error)
																	?.message ??
																'Could not delete order.';
															Alert.alert(
																'Delete Failed',
																msg
															);
														},
													}
												);
											},
										},
									]
								);
							}}
							testID='order-detail-delete'>
							<MaterialIcons
								name='delete-outline'
								size={16}
								color='#9CA3AF'
							/>
							<Text style={styles.deleteOrderText}>
								{deleteAppointment.isPending
									? 'Deleting…'
									: 'Delete order'}
							</Text>
						</Pressable>
					);
				})()}
			</ScrollView>

			{noteSheetOpen && (
				<OrderNoteSheet
					appointmentId={appointment.id}
					customerName={
						appointment.customer?.full_name ??
						appointment.customer_name ??
						'Customer'
					}
					onClose={() => setNoteSheetOpen(false)}
				/>
			)}
		</>
	);
}

/**
 * Read-only summary rendered for FOs who land here from a Pending
 * Reality intent card. The technician job-detail endpoint isn't
 * accessible for the FO role, but the franchise calendar
 * appointment-detail endpoint already populated the cache via
 * `useIntentDisplayLookup`, so we reuse that data here. This is NOT
 * a substitute for the full job UI — it's a "what does this
 * appointment look like" surface so the FO can confirm context
 * before going back to the review screen.
 */
function FranchiseAppointmentSummary({
	appt,
	router,
}: {
	appt: import('@technician/types/calendar').CalendarAppointmentItem;
	router: ReturnType<typeof useRouter>;
}) {
	const borderColor = StatusColorMap[appt.status];
	const services = appt.services ?? [];
	const dateText = appt.scheduled_date
		? new Date(appt.scheduled_date).toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			})
		: '—';
	const timeText =
		appt.scheduled_time && appt.scheduled_end_time
			? `${appt.scheduled_time.slice(0, 5)} – ${appt.scheduled_end_time.slice(0, 5)}`
			: appt.scheduled_time
				? appt.scheduled_time.slice(0, 5)
				: '—';

	return (
		<ScrollView style={styles.container}>
			<View style={[styles.card, { borderLeftColor: borderColor }]}>
				<View style={styles.row}>
					<Text style={styles.label}>Status</Text>
					<StatusBadge status={appt.status} />
				</View>
				{appt.customer_name ? (
					<>
						<View style={styles.row}>
							<Text style={styles.label}>Customer</Text>
							<Text style={styles.value}>
								{appt.customer_name}
							</Text>
						</View>
						{appt.customer_id > 0 ? (
							<Pressable
								style={styles.viewProfileBtn}
								onPress={() =>
									router.push(
										`/customers/${appt.customer_id}` as never
									)
								}>
								<MaterialIcons
									name='person'
									size={18}
									color='#3B82F6'
								/>
								<Text style={styles.viewProfileText}>
									View Customer Profile
								</Text>
								<MaterialIcons
									name='chevron-right'
									size={20}
									color='#3B82F6'
								/>
							</Pressable>
						) : null}
					</>
				) : null}
				{appt.technician_name ? (
					<View style={styles.row}>
						<Text style={styles.label}>Technician</Text>
						<Text style={styles.value}>{appt.technician_name}</Text>
					</View>
				) : null}
				<View style={styles.row}>
					<Text style={styles.label}>Date</Text>
					<Text style={styles.value}>{dateText}</Text>
				</View>
				<View style={styles.row}>
					<Text style={styles.label}>Time</Text>
					<Text style={styles.value}>{timeText}</Text>
				</View>
				{appt.appointment_note ? (
					<View style={styles.row}>
						<Text style={styles.label}>Note</Text>
						<Text style={styles.value}>
							{appt.appointment_note}
						</Text>
					</View>
				) : null}
			</View>

			{services.length > 0 ? (
				<View style={styles.card}>
					<Text style={styles.sectionTitle}>Services</Text>
					{services.map((s) => (
						<View
							key={s.service_id}
							style={[
								styles.row,
								{ justifyContent: 'space-between' },
							]}>
							<Text style={styles.value}>
								{s.service_name}
								{s.quantity > 1 ? ` ×${s.quantity}` : ''}
							</Text>
							<Text style={styles.label}>
								${s.price.toFixed(2)}
							</Text>
						</View>
					))}
				</View>
			) : null}

			<View style={[styles.card, { backgroundColor: '#FFFBEB' }]}>
				<Text style={[styles.label, { color: '#92400E' }]}>
					Read-only view — full order tools available to assigned
					technician.
				</Text>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#F9FAFB',
	},
	card: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		borderLeftWidth: 4,
		gap: 12,
		marginBottom: 20,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	label: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
	value: { fontSize: 14, color: '#111827', fontWeight: '600' },
	viewProfileBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: '#EFF6FF',
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#BFDBFE',
	},
	viewProfileText: {
		flex: 1,
		fontSize: 14,
		fontWeight: '600',
		color: '#3B82F6',
	},
	navigateBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: '#EFF6FF',
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#BFDBFE',
	},
	navigateText: {
		flex: 1,
		fontSize: 14,
		fontWeight: '600',
		color: '#3B82F6',
	},
	carfaxRow: {
		gap: 8,
		paddingTop: 4,
	},
	carfaxReportBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		backgroundColor: '#1D4ED8',
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 10,
		marginTop: 8,
		alignSelf: 'flex-start',
		minHeight: 36,
	},
	carfaxReportBtnDisabled: {
		opacity: 0.6,
	},
	carfaxReportBtnText: {
		color: '#fff',
		fontSize: 13,
		fontWeight: '700',
	},
	continueJobBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		backgroundColor: '#22C55E',
		paddingVertical: 16,
		borderRadius: 14,
		marginBottom: 20,
		minHeight: 52,
		shadowColor: '#22C55E',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 3,
	},
	continueJobText: {
		fontSize: 17,
		fontWeight: '700',
		color: '#fff',
	},
	startJobBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		backgroundColor: '#3B82F6',
		paddingVertical: 16,
		borderRadius: 14,
		marginBottom: 20,
		minHeight: 52,
		shadowColor: '#3B82F6',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 3,
	},
	startJobBtnText: {
		fontSize: 17,
		fontWeight: '700',
		color: '#fff',
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#111827',
		marginBottom: 12,
	},
	notesHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	addNoteBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		backgroundColor: '#EFF6FF',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#BFDBFE',
	},
	addNoteBtnText: {
		fontSize: 13,
		fontWeight: '600',
		color: '#3B82F6',
	},
	notesEmptyHint: {
		fontSize: 13,
		color: '#9CA3AF',
		fontStyle: 'italic',
		marginBottom: 20,
		lineHeight: 18,
	},
	notesList: {
		gap: 8,
		marginBottom: 20,
	},
	noteRow: {
		backgroundColor: '#fff',
		padding: 12,
		borderRadius: 10,
		gap: 4,
		borderLeftWidth: 3,
		borderLeftColor: '#3B82F6',
	},
	noteBody: {
		fontSize: 14,
		color: '#111827',
		lineHeight: 20,
	},
	noteMeta: {
		fontSize: 11,
		color: '#9CA3AF',
		fontWeight: '500',
	},
	serviceRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		backgroundColor: '#fff',
		padding: 14,
		borderRadius: 10,
		marginBottom: 8,
	},
	serviceName: { fontSize: 15, color: '#111827', fontWeight: '500' },
	servicePrice: { fontSize: 15, color: '#059669', fontWeight: '600' },
	emptyText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center' },
	// 2026-05-25 — Subtle gray Delete affordance for accidentally-
	// created orders. Low visual weight so it never competes with
	// primary CTAs above; the Alert dialog is the real safety gate.
	deleteOrderBtn: {
		marginTop: 24,
		marginBottom: 8,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 12,
		borderRadius: 10,
		backgroundColor: '#F9FAFB',
		borderWidth: 1,
		borderColor: '#E5E7EB',
	},
	deleteOrderBtnDisabled: { opacity: 0.5 },
	deleteOrderText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#6B7280',
	},
});
