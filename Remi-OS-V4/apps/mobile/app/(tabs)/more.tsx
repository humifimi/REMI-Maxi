import { useCallback, useEffect, useState } from 'react';
import {
	StyleSheet,
	View,
	Text,
	Image,
	ScrollView,
	Pressable,
	Alert,
	ActivityIndicator,
	Switch,
	ActionSheetIOS,
	Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { NativeCamera } from "@technician/constants/runtime";
// @demo-start
import { useQueryClient } from '@tanstack/react-query';
// @demo-end
import { useLogout } from '@technician/hooks/auth/use-auth';
import { useAuthStore } from '@/src/stores/auth';
// 2026-05-25 — Field-test identity gate + seeder controls. The
// `@maxi-mobile.com` account uses the Mon-Sun field-test seeder
// instead of the demo-reset path; tapping "Reset Demo Data" on
// that account would wipe the real field-test data the operator
// just seeded, so the demo controls are hidden and these are
// surfaced in their place.
import {
	useIsFieldTestIdentity,
	useReseedFieldTestWeek,
	useClearFieldTestSeed,
} from '@technician/hooks/dev/use-field-test-seed';
import { useBiometric, getBiometricLabel } from '@technician/hooks/auth/use-biometric';
import { useUploadAvatar } from '@technician/hooks/auth/use-upload-avatar';
import { useTrainingXP } from '@technician/hooks/training/use-training-xp';
import { AvatarEditor } from '@/src/components/shared/avatar-editor';
import { CanAccess } from '@/src/components/shared/can-access';
import { Brand } from '@technician/constants/brand';
import { canManageRoles } from '@/src/stores/app-mode';
import type { TrainingBadge } from '@technician/types/api';
// @demo-start
import axios, { AxiosError } from 'axios';
import { api } from '@technician/api/client';
import { Endpoints } from '@technician/api/endpoints';
import { Config } from '@technician/constants/config';
import { useDispatchOfferStore } from '@technician/stores/dispatch-offer';
import { useCalendarStore } from '@technician/stores/calendar';
import type { IncomingDispatch } from '@technician/types/api';
import {
	useDemoSettingsStore,
	type DualDeviceMode,
	type LinterStrictness,
} from '@technician/stores/demo-settings';
// @demo-end

export default function MoreScreen() {
	const router = useRouter();
	const logout = useLogout();
	const user = useAuthStore((s) => s.user);
	const isFieldTest = useIsFieldTestIdentity();
	const reseedFieldTest = useReseedFieldTestWeek();
	const clearFieldTest = useClearFieldTestSeed();
	// @demo-start
	const queryClient = useQueryClient();
	// @demo-end
	const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
	const getBiometricEnabled = useAuthStore((s) => s.getBiometricEnabled);
	const { isAvailable: biometricAvailable, biometricType } = useBiometric();
	const biometricLabel = getBiometricLabel(biometricType);
	const setUser = useAuthStore((s) => s.setUser);
	const [biometricOn, setBiometricOn] = useState(false);
	const [editorVisible, setEditorVisible] = useState(false);
	const [editorUri, setEditorUri] = useState('');
	const uploadAvatar = useUploadAvatar();
	const { data: xpData } = useTrainingXP();

	useEffect(() => {
		getBiometricEnabled().then(setBiometricOn);
	}, [getBiometricEnabled]);

	const pickImage = useCallback(async (source: 'camera' | 'library' | 'current') => {
		if (source === 'current') {
			if (!user?.profileImageUrl) return;
			setEditorUri(`${Config.API_BASE_URL}${user.profileImageUrl}`);
			setEditorVisible(true);
			return;
		}

		const launcher =
			source === 'camera'
				? ImagePicker.launchCameraAsync
				: ImagePicker.launchImageLibraryAsync;

		if (source === 'camera') NativeCamera.acquire();
		try {
			const result = await launcher({
				mediaTypes: ['images'],
				allowsEditing: false,
				quality: 1,
			});

			if (!result.canceled && result.assets[0]) {
				setEditorUri(result.assets[0].uri);
				setEditorVisible(true);
			}
		} finally {
			if (source === 'camera') NativeCamera.release();
		}
	}, [user?.profileImageUrl]);

	const handleAvatarPress = useCallback(() => {
		const options = ['Edit Current Photo', 'Choose from Library', 'Take Photo', 'Cancel'];
		const cancelIdx = 3;

		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{ options, cancelButtonIndex: cancelIdx },
				(idx) => {
					if (idx === 0) pickImage('current');
					else if (idx === 1) pickImage('library');
					else if (idx === 2) pickImage('camera');
				}
			);
		} else {
			Alert.alert('Change Photo', undefined, [
				{ text: 'Edit Current Photo', onPress: () => pickImage('current') },
				{ text: 'Choose from Library', onPress: () => pickImage('library') },
				{ text: 'Take Photo', onPress: () => pickImage('camera') },
				{ text: 'Cancel', style: 'cancel' },
			]);
		}
	}, [pickImage]);

	const handleAvatarSave = useCallback(
		async (croppedUri: string) => {
			setEditorVisible(false);
			try {
				const result = await uploadAvatar.mutateAsync(croppedUri);
				if (user) {
					await setUser({ ...user, profileImageUrl: result.profileImageUrl });
				}
			} catch {
				Alert.alert('Error', 'Could not upload avatar. Try again.');
			}
		},
		[uploadAvatar, user, setUser]
	);

	const handleBiometricToggle = useCallback(
		async (value: boolean) => {
			setBiometricOn(value);
			await setBiometricEnabled(value);
		},
		[setBiometricEnabled]
	);

	// @demo-start
	const [isResetting, setIsResetting] = useState(false);
	// D2P-FE-14 — sibling reset (with conflict scenarios) and manual
	// AI scan trigger have their own loading + toast states so they
	// don't fight the existing Reset Demo Data button. PRD §6.1.1/2.
	const [isResettingWithConflicts, setIsResettingWithConflicts] =
		useState(false);
	const [isRunningAiScan, setIsRunningAiScan] = useState(false);
	// D2P-FE-14 — push-token registration status surfaced under the
	// dual-device picker mode (d) per PRD §6.4. Lazily fetched (only
	// when the user actually picks (d)) so we never request push
	// permission as a side-effect of opening Settings.
	const [pushRegistered, setPushRegistered] = useState<boolean | null>(null);
	const dualDeviceMode = useDemoSettingsStore((s) => s.dualDeviceMode);
	const setDualDeviceMode = useDemoSettingsStore((s) => s.setDualDeviceMode);
	const linterStrictness = useDemoSettingsStore((s) => s.linterStrictness);
	const setLinterStrictness = useDemoSettingsStore(
		(s) => s.setLinterStrictness
	);
	const devShortcutVisible = useDemoSettingsStore(
		(s) => s.devShortcutVisible
	);
	const setDevShortcutVisible = useDemoSettingsStore(
		(s) => s.setDevShortcutVisible
	);
	const setTokens = useAuthStore((s) => s.setTokens);

	const handleDemoReset = () => {
		Alert.alert(
			'Reset Demo Data',
			'This will restore all data to the original demo state. Any changes you made will be lost.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Reset',
					style: 'destructive',
					onPress: async () => {
						setIsResetting(true);
						try {
							await axios.post(
								`${Config.API_BASE_URL}${Config.API_PREFIX}${Endpoints.demo.reset}`,
								null,
								{ timeout: 45000 }
							);
							const role =
								user?.role === 'franchise_owner'
									? 'franchise_owner'
									: 'technician';
							const loginRes = await axios.post<{
								data: {
									tokens: {
										accessToken: string;
										refreshToken: string;
									};
									user: {
										id: number;
										email: string;
										role: string;
										fullName: string;
										profileImageUrl?: string | null;
										franchiseId?: number;
									};
								};
							}>(
								`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/demo-login`,
								{ role }
							);
							const { tokens, user: freshUser } =
								loginRes.data.data;
							await setTokens(
								tokens.accessToken,
								tokens.refreshToken
							);
							await setUser({
								userId: freshUser.id,
								email: freshUser.email,
								role: freshUser.role as
									| 'technician'
									| 'franchise_owner',
								fullName: freshUser.fullName,
								profileImageUrl: freshUser.profileImageUrl,
								franchiseId: freshUser.franchiseId,
							});
							queryClient.invalidateQueries();
							// D2P-FE-14 — same fresh-seed empty-grid
							// fix as the conflict-seeded sibling.
							// `selectedTechIds` is session-only, so
							// without this nudge the FO calendar
							// lands on an empty grid until the user
							// taps a tech avatar. See
							// `setPendingAutoSelectFirstTech` docs in
							// `src/stores/calendar.ts`.
							useCalendarStore
								.getState()
								.setPendingAutoSelectFirstTech(true);
							Alert.alert('Done', 'Demo data has been reset.');
						} catch {
							Alert.alert(
								'Error',
								'Could not reset demo data. Try again.'
							);
						} finally {
							setIsResetting(false);
						}
					},
				},
			]
		);
	};

	// D2P-FE-14 — sibling to `handleDemoReset` that POSTs to the
	// conflict-seeded variant. Shares the destructive-confirm UX so
	// muscle memory between the two reset buttons matches; differs
	// only in endpoint, success copy, and the 403 ("demo mode
	// disabled") branch the seeded reset can return on backends
	// that haven't enabled the demo feature flag. PRD §6.1.1.
	//
	// Mirrors the same post-reset re-login dance the legacy
	// `handleDemoReset` does. The BE wipes + reseeds the users table
	// during the reset, which silently invalidates the JWT in the
	// user's pocket — without re-login, every subsequent calendar
	// query returns empty data scoped to a stale user record.
	// Symptom is the empty calendar from the 2026-04-27 smoke test.
	const handleDemoResetWithConflicts = () => {
		Alert.alert(
			'Reset Demo Data (with conflicts)',
			'This will restore demo data and seed deliberate conflict scenarios. Any changes you made will be lost.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Reset',
					style: 'destructive',
					onPress: async () => {
						setIsResettingWithConflicts(true);
						try {
							await api(
								'post',
								Endpoints.demo.resetWithConflicts
							);
							const role =
								user?.role === 'franchise_owner'
									? 'franchise_owner'
									: 'technician';
							const loginRes = await axios.post<{
								data: {
									tokens: {
										accessToken: string;
										refreshToken: string;
									};
									user: {
										id: number;
										email: string;
										role: string;
										fullName: string;
										profileImageUrl?: string | null;
										franchiseId?: number;
									};
								};
							}>(
								`${Config.API_BASE_URL}${Config.API_PREFIX}/auth/demo-login`,
								{ role }
							);
							const { tokens, user: freshUser } =
								loginRes.data.data;
							await setTokens(
								tokens.accessToken,
								tokens.refreshToken
							);
							await setUser({
								userId: freshUser.id,
								email: freshUser.email,
								role: freshUser.role as
									| 'technician'
									| 'franchise_owner',
								fullName: freshUser.fullName,
								profileImageUrl: freshUser.profileImageUrl,
								franchiseId: freshUser.franchiseId,
							});
							queryClient.invalidateQueries();
							// D2P-FE-14 — the FO calendar's
							// `selectedTechIds` is session-only and
							// starts empty by design, so a fresh seed
							// would otherwise land on an empty grid
							// even though the metric pills above it
							// populate. Set the one-shot flag the
							// calendar tab consumes on next data
							// arrival to auto-select the first tech
							// from the freshly-seeded roster.
							useCalendarStore
								.getState()
								.setPendingAutoSelectFirstTech(true);
							Alert.alert(
								'Demo data reset',
								'Demo data reset with conflict scenarios — try dragging an appointment now.'
							);
						} catch (err) {
							const status =
								err instanceof AxiosError
									? err.response?.status
									: undefined;
							if (status === 403) {
								Alert.alert(
									'Demo mode disabled',
									'Demo mode is disabled on this backend. Talk to the deploy admin.'
								);
							} else {
								Alert.alert(
									'Error',
									'Could not reset demo data. Try again.'
								);
							}
						} finally {
							setIsResettingWithConflicts(false);
						}
					},
				},
			]
		);
	};

	// D2P-FE-14 — manual AI scan trigger. Non-destructive (no
	// confirmation), surfaces three distinct outcomes per PRD §6.1.2:
	// success with detected_count, success-but-empty (encourage user
	// to seed conflicts first), and 403 demo-disabled.
	const handleRunAiScan = async () => {
		setIsRunningAiScan(true);
		try {
			const data = await api<{ detected_count: number }>(
				'post',
				Endpoints.demo.runAiScan
			);
			const count = data?.detected_count ?? 0;
			if (count === 0) {
				Alert.alert(
					'No suggestions',
					'AI scan ran — no suggestions surfaced. Try "Reset Demo Data (with conflict scenarios)" first.'
				);
			} else {
				Alert.alert(
					'AI scan complete',
					`AI scan complete — ${count} suggestion${count === 1 ? '' : 's'} generated. Open the AI tab on the review screen to see them.`
				);
			}
		} catch (err) {
			const status =
				err instanceof AxiosError
					? err.response?.status
					: undefined;
			if (status === 403) {
				Alert.alert(
					'Permission denied',
					'AI scan is FO-only and demo-mode-only.'
				);
			} else {
				Alert.alert(
					'Error',
					'Could not run AI scan. Try again.'
				);
			}
		} finally {
			setIsRunningAiScan(false);
		}
	};

	// D2P-FE-14 — when the user picks dual-device mode (d) we surface
	// the device's APNs registration status inline so they can tell
	// at a glance whether mode (d)'s push-driven leg will fire on
	// this device. We do NOT prompt for permission or fix anything
	// — read-only diagnostic per PRD §6.4. The token call throws on
	// simulator / unprivileged devices; treat any throw as
	// "not registered" rather than surfacing the underlying error.
	const handleDualDeviceModeChange = async (mode: DualDeviceMode) => {
		setDualDeviceMode(mode);
		if (mode !== 'd') {
			setPushRegistered(null);
			return;
		}
		try {
			const token = await Notifications.getDevicePushTokenAsync();
			setPushRegistered(Boolean(token?.data));
		} catch {
			setPushRegistered(false);
		}
	};

	const handleTestDispatch = () => {
		const demoDispatch: IncomingDispatch = {
			appointment_id: 9999,
			customer_name: 'Sarah Johnson',
			vehicle_summary: '2023 Toyota Camry (Silver)',
			service_names: ['Full Synthetic Oil Change', 'Tire Rotation'],
			scheduled_date: 'Mon, Apr 14, 2026',
			scheduled_time: '10:30 AM',
			address_line: '742 Evergreen Terrace',
			address_city: 'Springfield, IL',
			estimated_duration_minutes: 45,
			distance_miles: 3.2,
		};
		useDispatchOfferStore.getState().showOffer(demoDispatch);
	};
	// @demo-end

	const handleLogout = () => {
		Alert.alert('Logout', 'Are you sure you want to log out?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Logout',
				style: 'destructive',
				onPress: async () => {
					await logout();
					router.replace('/(auth)/login');
				},
			},
		]);
	};

	return (
		<ScrollView style={styles.container}>
		<View style={styles.profileCard}>
			<Pressable onPress={handleAvatarPress} style={styles.avatarTouchable}>
				{user?.profileImageUrl ? (
					<Image
						source={{
							uri: `${Config.API_BASE_URL}${user.profileImageUrl}`,
						}}
						style={styles.avatarImage}
					/>
				) : (
					<View style={styles.avatar}>
						<Text style={styles.avatarText}>
							{user?.fullName
								?.split(' ')
								.map((n) => n[0])
								.join('')
								.slice(0, 2)
								.toUpperCase() ?? '?'}
						</Text>
					</View>
				)}
				<View style={styles.editBadge}>
					<MaterialIcons name='edit' size={12} color='#fff' />
				</View>
			</Pressable>
			<View style={styles.profileInfo}>
				<Text style={styles.profileName}>
					{user?.fullName ?? '—'}
				</Text>
				<Text style={styles.profileEmail}>
					{user?.email ?? '—'}
				</Text>
				<Text style={styles.profileRole}>
					{user?.role === 'franchise_owner'
						? 'Franchise Owner'
						: 'Technician'}
				</Text>
			</View>
		</View>

	<AvatarEditor
		visible={editorVisible}
		imageUri={editorUri}
		onSave={handleAvatarSave}
		onCancel={() => setEditorVisible(false)}
	/>

		{xpData && (
			<Pressable
				style={styles.xpStrip}
				onPress={() => router.push('/training')}
			>
				<View style={styles.xpBadgeSmall}>
					<Text style={styles.xpIconSmall}>⚡</Text>
					<Text style={styles.xpValueSmall}>{xpData.total_xp.toLocaleString()}</Text>
					<Text style={styles.xpLabelSmall}>XP</Text>
				</View>
				<View style={styles.xpInfo}>
					<Text style={styles.xpLevelName}>{xpData.current_level_name}</Text>
					<View style={styles.xpBarTrack}>
						<View
							style={[
								styles.xpBarFill,
								{
									width: `${Math.min(
										100,
										xpData.xp_to_next_level > 0
											? (xpData.xp_in_current_level / (xpData.xp_in_current_level + xpData.xp_to_next_level)) * 100
											: 100,
									)}%`,
								},
							]}
						/>
					</View>
				</View>
				{xpData.badges.filter((b: TrainingBadge) => b.earned).length > 0 && (
					<View style={styles.badgePreviews}>
						{xpData.badges
							.filter((b: TrainingBadge) => b.earned)
							.slice(0, 3)
							.map((b: TrainingBadge) => (
								<Text key={b.id} style={styles.badgePreviewIcon}>
									{b.icon}
								</Text>
							))}
					</View>
				)}
				<MaterialIcons name='chevron-right' size={20} color='#9CA3AF' />
			</Pressable>
		)}

		<MenuItem
			icon='chat'
			label='Messages'
				onPress={() => router.push('/message')}
				subtitle='QuickText conversations'
			/>
			<MenuItem
				icon='forum'
				label='Signal'
				onPress={() => router.push('/(tabs)/signal' as never)}
				subtitle='Team feed & help requests'
			/>
			<MenuItem
				icon='inventory-2'
				label='Inventory'
				onPress={() => router.push('/inventory')}
				subtitle='Stock levels, adjustments, waste'
			/>
			<MenuItem
				icon='verified-user'
				label={Brand.shieldName}
				onPress={() => router.push('/shield')}
				subtitle='Quality inspections'
			/>
			<MenuItem
				icon='manage-search'
				label='CARFAX Tools'
				onPress={() => router.push('/carfax-tools')}
				subtitle='Plate→VIN & service history lookups'
			/>
			<MenuItem
				icon='school'
				label='Training Hub'
				onPress={() => router.push('/training')}
				subtitle='Certifications & modules'
			/>
			<MenuItem
				icon='flag'
				label='Referrals'
				onPress={() => router.push('/referral')}
				subtitle='Issue referral history'
			/>
		<MenuItem
			icon='trending-up'
			label='My Performance'
			onPress={() => router.push('/performance')}
			subtitle='Ratings, badges & trends'
		/>
		<MenuItem
			icon='calculate'
			label='Profit Calculator'
			onPress={() => router.push('/(public)/profit-calculator')}
			subtitle='Model territory economics'
		/>
		{user?.role === 'franchise_owner' && (
			<MenuItem
				icon='favorite'
				label='Team Wellness'
				onPress={() => router.push('/team-wellness')}
				subtitle='Mood trends & check-in rates'
			/>
		)}
		{/* MSG-FE-FO-1 — Franchise Owner messaging-oversight entry point. */}
		{user?.role === 'franchise_owner' && (
			<MenuItem
				icon='inbox'
				label='Franchise Messages'
				onPress={() => router.push('/franchise/messages' as never)}
				subtitle='Read & intervene on tech ⇄ customer threads'
			/>
		)}
		{canManageRoles(user?.role) ? (
			<MenuItem
				icon='badge'
				label='Roles'
				onPress={() => router.push('/admin/roles' as never)}
				subtitle='Add, edit, and deactivate user roles'
			/>
		) : null}
		{canManageRoles(user?.role) ? (
			<MenuItem
				icon='security'
				label='Permissions'
				onPress={() => router.push('/franchise/permissions' as never)}
				subtitle='Grant/revoke per-user capability overrides'
			/>
		) : null}
		{canManageRoles(user?.role) ? (
			<MenuItem
				icon='public'
				label='Cross-franchise Permissions'
				onPress={() => router.push('/admin/permissions' as never)}
				subtitle='Manage capability overrides across all franchises'
			/>
		) : null}

			<MenuItem
				icon='settings'
				label='Settings'
				onPress={() => router.push('/settings')}
			/>
			<MenuItem
				icon='help-outline'
				label='Support'
				onPress={() => router.push('/help')}
				subtitle='Help & bug reporting'
			/>

			{biometricAvailable ? (
				<View style={styles.menuItem}>
					<MaterialIcons
						name={biometricType === 'face' ? 'face' : 'fingerprint'}
						size={24}
						color='#374151'
					/>
					<View style={styles.menuInfo}>
						<Text style={styles.menuLabel}>{biometricLabel}</Text>
						<Text style={styles.menuSubtitle}>
							Unlock app with {biometricLabel}
						</Text>
					</View>
					<Switch
						value={biometricOn}
						onValueChange={handleBiometricToggle}
						trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
						thumbColor={biometricOn ? '#3B82F6' : '#F9FAFB'}
					/>
				</View>
			) : null}

			{/* @demo-start */}
			{/* 2026-05-25 — Field Test Tools panel. Visible ONLY for
			    the MAXI field-test identity (`@maxi-mobile.com`);
			    every other account sees the Demo Mode panel below
			    instead. The BE applies the same gate, so even if
			    this somehow rendered for another user the buttons
			    would just 403. */}
			{isFieldTest && (
				<View testID='field-test-section' style={styles.fieldTestSection}>
					<Text style={styles.fieldTestSectionHeader}>
						Field Test Tools
					</Text>
					<View style={styles.fieldTestCard}>
						<View style={styles.fieldTestRow}>
							<View style={styles.fieldTestLabelGroup}>
								<Text style={styles.fieldTestTitle}>
									Reseed Test Week
								</Text>
								<Text style={styles.fieldTestSubtitle}>
									Wipes the current Mon–Sun seed (and any
									address-less appointments in that week) and
									creates a fresh batch of 4–9 unique
									appointments per day between 5 AM and 6 PM.
								</Text>
							</View>
							<Pressable
								style={({ pressed }) => [
									styles.fieldTestBtn,
									styles.fieldTestBtnPrimary,
									pressed && styles.fieldTestBtnPressed,
									reseedFieldTest.isPending &&
										styles.fieldTestBtnDisabled,
								]}
								onPress={() => {
									if (reseedFieldTest.isPending) return;
									Alert.alert(
										'Reseed Test Week?',
										'This wipes any previously-seeded test appointments AND removes real appointments in this week that have no address on file. Real appointments WITH addresses are not touched.',
										[
											{ text: 'Cancel', style: 'cancel' },
											{
												text: 'Reseed',
												style: 'destructive',
												onPress: () => {
													reseedFieldTest.mutate(undefined, {
														onSuccess: (r) => {
															Alert.alert(
																'Seed Complete',
																`Created ${r.appointmentsCreated} appointments for ${r.weekStart} – ${r.weekEnd}.\nWiped ${r.seedRowsWiped} previous seed rows + ${r.addresslessRowsWiped} address-less rows.`,
															);
														},
														onError: (err) => {
															Alert.alert(
																'Reseed Failed',
																err.message || 'Could not reseed test week.',
															);
														},
													});
												},
											},
										],
									);
								}}
								testID='more-field-test-reseed'>
								<Text style={styles.fieldTestBtnTextPrimary}>
									{reseedFieldTest.isPending ? 'Seeding…' : 'Reseed'}
								</Text>
							</Pressable>
						</View>
						<View style={styles.fieldTestDivider} />
						<View style={styles.fieldTestRow}>
							<View style={styles.fieldTestLabelGroup}>
								<Text style={styles.fieldTestTitle}>
									Clear Seeded Appointments
								</Text>
								<Text style={styles.fieldTestSubtitle}>
									Off-switch for ONLY the seeded appointments
									(anything tagged `FIELD_TEST_SEED:`). Real
									appointments — including address-less ones —
									are never touched.
								</Text>
							</View>
							<Pressable
								style={({ pressed }) => [
									styles.fieldTestBtn,
									styles.fieldTestBtnDanger,
									pressed && styles.fieldTestBtnPressed,
									clearFieldTest.isPending &&
										styles.fieldTestBtnDisabled,
								]}
								onPress={() => {
									if (clearFieldTest.isPending) return;
									Alert.alert(
										'Clear Seeded Appointments?',
										'This deletes every appointment tagged as a field-test seed. Real appointments are not touched.',
										[
											{ text: 'Cancel', style: 'cancel' },
											{
												text: 'Clear',
												style: 'destructive',
												onPress: () => {
													clearFieldTest.mutate(undefined, {
														onSuccess: (r) => {
															Alert.alert(
																'Cleared',
																`Deleted ${r.deleted} seeded appointments.`,
															);
														},
														onError: (err) => {
															Alert.alert(
																'Clear Failed',
																err.message || 'Could not clear seeded appointments.',
															);
														},
													});
												},
											},
										],
									);
								}}
								testID='more-field-test-clear'>
								<Text style={styles.fieldTestBtnTextDanger}>
									{clearFieldTest.isPending ? 'Clearing…' : 'Clear'}
								</Text>
							</Pressable>
						</View>
					</View>
				</View>
			)}

			{/*
			 * D2P-FE-14 — FO-only "Demo Mode" panel. Sits between
			 * the Account / biometric block above and the existing
			 * "Reset Demo Data" button below. Five controls, all
			 * spec'd in `docs/implementation-plans/pending-reality-
			 * demo-bundle.md` §6.1. The whole section is gated on
			 * `user.role === "franchise_owner"`; technicians never
			 * see any of it.
			 *
			 * 2026-05-25 — Also hidden for the field-test identity
			 * (`@maxi-mobile.com`). That account uses the Field Test
			 * Tools panel above instead, and tapping any of these
			 * demo-reset paths would wipe the field-test data the
			 * operator just seeded.
			 */}
			{user?.role === 'franchise_owner' && !isFieldTest && (
				<View testID='demo-mode-section' style={styles.demoSection}>
					<Text style={styles.demoSectionHeader}>Demo Mode</Text>

					{/* 1. Sibling reset — seeds conflict scenarios. */}
					<Pressable
						testID='demo-reset-with-conflicts'
						style={[
							styles.resetBtn,
							styles.demoSectionFirstBtn,
							isResettingWithConflicts && styles.resetBtnDisabled,
						]}
						onPress={handleDemoResetWithConflicts}
						disabled={isResettingWithConflicts}>
						{isResettingWithConflicts ? (
							<ActivityIndicator
								size='small'
								color='#F59E0B'
							/>
						) : (
							<MaterialIcons
								name='warning-amber'
								size={22}
								color='#F59E0B'
							/>
						)}
						<Text style={styles.resetText}>
							{isResettingWithConflicts
								? 'Resetting...'
								: 'Reset Demo Data (with conflict scenarios)'}
						</Text>
					</Pressable>

					{/* 2. Manual AI scan trigger. */}
					<Pressable
						testID='demo-run-ai-scan'
						style={[
							styles.aiScanBtn,
							isRunningAiScan && styles.resetBtnDisabled,
						]}
						onPress={handleRunAiScan}
						disabled={isRunningAiScan}>
						{isRunningAiScan ? (
							<ActivityIndicator
								size='small'
								color='#7C3AED'
							/>
						) : (
							<MaterialIcons
								name='auto-awesome'
								size={22}
								color='#7C3AED'
							/>
						)}
						<Text style={styles.aiScanText}>
							{isRunningAiScan
								? 'Running AI scan...'
								: 'Run AI scan now'}
						</Text>
					</Pressable>

					{/* 3. Dual-device demo mode picker. */}
					<View style={styles.pickerCard}>
						<Text style={styles.pickerLabel}>
							Dual-device demo mode
						</Text>
						<Text style={styles.pickerSubtitle}>
							Sequencing helper for live demos. Both devices must be signed in to the same franchise; roles can be any mix (FO + Tech, FO + FO, Tech + Tech). Picker is descriptive — does not gate any code path.
						</Text>
						<DualDeviceModePicker
							value={dualDeviceMode}
							onChange={handleDualDeviceModeChange}
						/>
						{dualDeviceMode != null && (
							<View style={styles.helpCard}>
								<Text style={styles.helpCardText}>
									{DUAL_DEVICE_HELP[dualDeviceMode]}
								</Text>
								{dualDeviceMode === 'd' &&
									pushRegistered != null && (
										<Text
											testID='dual-device-push-status'
											style={[
												styles.pushStatus,
												pushRegistered
													? styles.pushStatusOk
													: styles.pushStatusWarn,
											]}>
											{pushRegistered
												? 'Push notifications: ✅ registered'
												: '⚠️ Push notifications not registered on this device — mode (d) won\u2019t fire.'}
										</Text>
									)}
							</View>
						)}
					</View>

					{/* 4. Dev-shortcut visibility toggle. */}
					<View style={styles.menuItem}>
						<MaterialIcons
							name='build'
							size={24}
							color='#374151'
						/>
						<View style={styles.menuInfo}>
							<Text style={styles.menuLabel}>
								Show dev seed shortcut on review screen
							</Text>
							<Text style={styles.menuSubtitle}>
								Surfaces the &quot;DEV ✎ Review&quot; pill
								when seeded data is required to exercise the
								flow. Only effective in development builds.
							</Text>
						</View>
						<Switch
							testID='demo-dev-shortcut-toggle'
							value={devShortcutVisible}
							onValueChange={setDevShortcutVisible}
							trackColor={{
								false: '#D1D5DB',
								true: '#93C5FD',
							}}
							thumbColor={
								devShortcutVisible ? '#3B82F6' : '#F9FAFB'
							}
						/>
					</View>

					{/* 5. Linter strictness picker. */}
					<View style={styles.pickerCard}>
						<Text style={styles.pickerLabel}>
							Linter strictness
						</Text>
						<Text style={styles.pickerSubtitle}>
							Controls when the Pending Reality intercept
							fires on a drag or form submit.
						</Text>
						<LinterStrictnessPicker
							value={linterStrictness}
							onChange={setLinterStrictness}
						/>
					</View>
				</View>
			)}

			{/* 2026-05-25 — Hidden for the field-test identity. That
			    account's "real" data IS the field-test seed, and the
			    demo-reset wipes-and-replays the demo data set. The
			    field-test seeder (below) is the equivalent for
			    `@maxi-mobile.com`. */}
			{!isFieldTest && (
				<Pressable
					style={[
						styles.resetBtn,
						isResetting && styles.resetBtnDisabled,
					]}
					onPress={handleDemoReset}
					disabled={isResetting}>
					{isResetting ? (
						<ActivityIndicator size='small' color='#F59E0B' />
					) : (
						<MaterialIcons
							name='restart-alt'
							size={22}
							color='#F59E0B'
						/>
					)}
					<Text style={styles.resetText}>
						{isResetting ? 'Resetting...' : 'Reset Demo Data'}
					</Text>
				</Pressable>
			)}
			<Pressable
				style={styles.testDispatchBtn}
				onPress={handleTestDispatch}>
				<MaterialIcons
					name='notifications-active'
					size={22}
					color='#3B82F6'
				/>
				<Text style={styles.testDispatchText}>Test Dispatch Offer</Text>
			</Pressable>
			{/* @demo-end */}

			<Pressable style={styles.logoutBtn} onPress={handleLogout}>
				<MaterialIcons name='logout' size={22} color='#EF4444' />
				<Text style={styles.logoutText}>Log Out</Text>
			</Pressable>

			<Text style={styles.version}>
				{Brand.techAppName} v{Brand.version}
			</Text>
		</ScrollView>
	);
}

// @demo-start
// D2P-FE-14 — inline help-card copy mirrors PRD §3.3 prose for each
// dual-device demo mode. Kept as plain strings here (rather than
// imported from the PRD) because the audience is the FO running the
// demo on their phone — they need the wording to match what the
// audience will see, not the spec ID.
//
// 2026-04-27 update: the dual-device picker is role-agnostic — any two
// devices signed in to the SAME franchise see each other's pending
// changes (FO + Tech, FO + FO, Tech + Tech all work). The roles in
// "device 1 / device 2" refer to ordering, not user role. Mode (a)'s
// "low-fidelity overlay" is the cyan tile painted by
// `applyPendingChangeBorderOverride` (`src/components/calendar/
// pending-change-overlay-style.ts`) — appears on the other device after
// the next calendar refetch (foregrounding the app or the 30s
// `staleTime`). See `docs/PLAN-DEVIATIONS.md#2026-04-27-pending-overlay-tint`
// for why the tile is solid cyan instead of the originally-planned
// dashed yellow border.
const DUAL_DEVICE_HELP: Record<NonNullable<DualDeviceMode>, string> = {
	a: 'Stage on device 1 → propose changes locally. Device 2 paints the affected appointment(s) cyan (the low-fidelity overlay) on its next refetch — foreground the app or wait ~30s. The cyan tile clears on device 2 once device 1 finalizes or cancels.',
	b: 'Finalize on device 1 → device 2 receives the live update via realtime and the calendar reflects the new state immediately.',
	c: 'Drag on device 1 → device 2 sees the cyan cross-device intent tile appear and can tap into Pending Reality to review or counter-propose.',
	d: 'Counter-propose on device 1 → device 2 receives an APNs push notification with the proposal. Requires push registration on device 2.',
};

function DualDeviceModePicker({
	value,
	onChange,
}: {
	value: DualDeviceMode;
	onChange: (mode: DualDeviceMode) => void;
}) {
	const options: { key: NonNullable<DualDeviceMode>; label: string }[] = [
		{ key: 'a', label: '(a) Stage → overlay' },
		{ key: 'b', label: '(b) Finalize → live update' },
		{ key: 'c', label: '(c) Drag → cross-device' },
		{ key: 'd', label: '(d) Counter-propose → push' },
	];
	return (
		<View style={pickerStyles.column}>
			{options.map((opt) => {
				const active = value === opt.key;
				return (
					<Pressable
						key={opt.key}
						testID={`dual-device-mode-${opt.key}`}
						accessibilityRole='radio'
						accessibilityState={{ selected: active }}
						style={[
							pickerStyles.row,
							active && pickerStyles.rowActive,
						]}
						onPress={() => onChange(active ? null : opt.key)}>
						<Text
							style={[
								pickerStyles.rowText,
								active && pickerStyles.rowTextActive,
							]}>
							{opt.label}
						</Text>
						{active && (
							<MaterialIcons
								name='check'
								size={18}
								color='#3B82F6'
							/>
						)}
					</Pressable>
				);
			})}
		</View>
	);
}

function LinterStrictnessPicker({
	value,
	onChange,
}: {
	value: LinterStrictness;
	onChange: (strictness: LinterStrictness) => void;
}) {
	const options: { key: LinterStrictness; label: string }[] = [
		{ key: 'strict', label: 'Strict — hard conflicts only' },
		{ key: 'loose', label: 'Loose — warnings included' },
	];
	return (
		<View style={pickerStyles.row2col}>
			{options.map((opt) => {
				const active = value === opt.key;
				return (
					<Pressable
						key={opt.key}
						testID={`linter-strictness-${opt.key}`}
						accessibilityRole='radio'
						accessibilityState={{ selected: active }}
						style={[
							pickerStyles.segment,
							active && pickerStyles.segmentActive,
						]}
						onPress={() => onChange(opt.key)}>
						<Text
							style={[
								pickerStyles.segmentText,
								active && pickerStyles.segmentTextActive,
							]}>
							{opt.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const pickerStyles = StyleSheet.create({
	column: {
		gap: 6,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#E5E7EB',
		backgroundColor: '#FFFFFF',
	},
	rowActive: {
		borderColor: '#3B82F6',
		backgroundColor: '#EFF6FF',
	},
	rowText: {
		fontSize: 14,
		color: '#374151',
		fontWeight: '500',
	},
	rowTextActive: {
		color: '#1D4ED8',
		fontWeight: '700',
	},
	row2col: {
		flexDirection: 'row',
		gap: 8,
	},
	segment: {
		flex: 1,
		paddingVertical: 10,
		paddingHorizontal: 8,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: '#E5E7EB',
		backgroundColor: '#FFFFFF',
		alignItems: 'center',
	},
	segmentActive: {
		borderColor: '#3B82F6',
		backgroundColor: '#EFF6FF',
	},
	segmentText: {
		fontSize: 13,
		color: '#374151',
		fontWeight: '500',
		textAlign: 'center',
	},
	segmentTextActive: {
		color: '#1D4ED8',
		fontWeight: '700',
	},
});
// @demo-end

function MenuItem({
	icon,
	label,
	onPress,
	subtitle,
}: {
	icon: keyof typeof MaterialIcons.glyphMap;
	label: string;
	onPress: () => void;
	subtitle?: string;
}) {
	return (
		<Pressable style={styles.menuItem} onPress={onPress}>
			<MaterialIcons name={icon} size={24} color='#374151' />
			<View style={styles.menuInfo}>
				<Text style={styles.menuLabel}>{label}</Text>
				{subtitle ? (
					<Text style={styles.menuSubtitle}>{subtitle}</Text>
				) : null}
			</View>
			<MaterialIcons name='chevron-right' size={24} color='#9CA3AF' />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#F9FAFB' },
	profileCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#fff',
		padding: 20,
		margin: 16,
		borderRadius: 16,
		gap: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.06,
		shadowRadius: 4,
		elevation: 1,
	},
	avatarTouchable: {
		position: 'relative',
	},
	avatar: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: '#EEF2FF',
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarImage: {
		width: 64,
		height: 64,
		borderRadius: 32,
	},
	editBadge: {
		position: 'absolute',
		bottom: 0,
		right: 0,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: '#3B82F6',
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#fff',
	},
	avatarText: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
	profileInfo: { flex: 1 },
	profileName: { fontSize: 18, fontWeight: '700', color: '#111827' },
	profileEmail: { fontSize: 14, color: '#6B7280', marginTop: 2 },
	profileRole: {
		fontSize: 12,
		fontWeight: '600',
		color: '#3B82F6',
		marginTop: 4,
		textTransform: 'uppercase',
		letterSpacing: 1,
	},
	xpStrip: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#1E1B4B',
		marginHorizontal: 16,
		marginBottom: 12,
		borderRadius: 14,
		padding: 12,
		gap: 10,
	},
	xpBadgeSmall: {
		alignItems: 'center',
		backgroundColor: '#312E81',
		borderRadius: 10,
		paddingVertical: 6,
		paddingHorizontal: 10,
	},
	xpIconSmall: { fontSize: 14 },
	xpValueSmall: { fontSize: 16, fontWeight: '900', color: '#FCD34D', fontVariant: ['tabular-nums'] },
	xpLabelSmall: { fontSize: 8, fontWeight: '700', color: '#A5B4FC', letterSpacing: 1 },
	xpInfo: { flex: 1 },
	xpLevelName: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 4 },
	xpBarTrack: {
		height: 4,
		backgroundColor: '#312E81',
		borderRadius: 2,
		overflow: 'hidden',
	},
	xpBarFill: {
		height: 4,
		backgroundColor: '#FCD34D',
		borderRadius: 2,
	},
	badgePreviews: {
		flexDirection: 'row',
		gap: 2,
	},
	badgePreviewIcon: { fontSize: 18 },
	menuItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#fff',
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
		borderBottomColor: '#F3F4F6',
		gap: 14,
	},
	menuInfo: { flex: 1 },
	menuLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
	menuSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
	// @demo-start
	demoSection: {
		marginTop: 24,
		marginHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 4,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: '#E5E7EB',
		backgroundColor: '#FFFFFF',
		gap: 12,
	},
	// 2026-05-25 — Field Test Tools styles. Mirror the demoSection
	// shell so the two panels are visually consistent (only one
	// renders at a time on any given account).
	fieldTestSection: {
		marginTop: 24,
		marginHorizontal: 16,
		gap: 8,
	},
	fieldTestSectionHeader: {
		fontSize: 11,
		fontWeight: '800',
		color: '#6B7280',
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		paddingHorizontal: 4,
	},
	fieldTestCard: {
		backgroundColor: '#FFFFFF',
		borderRadius: 14,
		borderWidth: 1,
		borderColor: '#E5E7EB',
		overflow: 'hidden',
	},
	fieldTestRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 14,
		paddingHorizontal: 14,
		gap: 12,
	},
	fieldTestLabelGroup: {
		flex: 1,
		gap: 4,
	},
	fieldTestTitle: {
		fontSize: 15,
		fontWeight: '600',
		color: '#111827',
	},
	fieldTestSubtitle: {
		fontSize: 12,
		color: '#6B7280',
		lineHeight: 16,
	},
	fieldTestBtn: {
		minWidth: 84,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	fieldTestBtnPrimary: {
		backgroundColor: '#3B82F6',
	},
	fieldTestBtnDanger: {
		backgroundColor: '#FEE2E2',
		borderWidth: 1,
		borderColor: '#FCA5A5',
	},
	fieldTestBtnPressed: {
		opacity: 0.7,
	},
	fieldTestBtnDisabled: {
		opacity: 0.5,
	},
	fieldTestBtnTextPrimary: {
		fontSize: 14,
		fontWeight: '700',
		color: '#FFFFFF',
	},
	fieldTestBtnTextDanger: {
		fontSize: 14,
		fontWeight: '700',
		color: '#EF4444',
	},
	fieldTestDivider: {
		height: 1,
		backgroundColor: '#F3F4F6',
		marginHorizontal: 14,
	},
	demoSectionHeader: {
		fontSize: 11,
		fontWeight: '800',
		color: '#6B7280',
		letterSpacing: 1.4,
		textTransform: 'uppercase',
		paddingHorizontal: 4,
	},
	demoSectionFirstBtn: {
		marginTop: 0,
		marginHorizontal: 0,
	},
	aiScanBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		paddingVertical: 14,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#DDD6FE',
		backgroundColor: '#F5F3FF',
	},
	aiScanText: { fontSize: 15, fontWeight: '600', color: '#7C3AED' },
	pickerCard: {
		paddingVertical: 12,
		paddingHorizontal: 4,
		gap: 8,
	},
	pickerLabel: {
		fontSize: 14,
		fontWeight: '700',
		color: '#111827',
	},
	pickerSubtitle: {
		fontSize: 12,
		color: '#6B7280',
		marginBottom: 4,
	},
	helpCard: {
		marginTop: 8,
		padding: 10,
		borderRadius: 8,
		backgroundColor: '#F3F4F6',
		gap: 6,
	},
	helpCardText: {
		fontSize: 12,
		color: '#374151',
		lineHeight: 17,
	},
	pushStatus: {
		fontSize: 12,
		fontWeight: '600',
	},
	pushStatusOk: { color: '#15803D' },
	pushStatusWarn: { color: '#B45309' },
	resetBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		marginTop: 32,
		marginHorizontal: 16,
		paddingVertical: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#FDE68A',
		backgroundColor: '#FFFBEB',
	},
	resetBtnDisabled: { opacity: 0.6 },
	resetText: { fontSize: 16, fontWeight: '600', color: '#F59E0B' },
	testDispatchBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		marginTop: 12,
		marginHorizontal: 16,
		paddingVertical: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#BFDBFE',
		backgroundColor: '#EFF6FF',
	},
	testDispatchText: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
	// @demo-end
	logoutBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		marginTop: 12,
		marginHorizontal: 16,
		paddingVertical: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#FCA5A5',
		backgroundColor: '#FEF2F2',
	},
	logoutText: { fontSize: 16, fontWeight: '600', color: '#EF4444' },
	version: {
		textAlign: 'center',
		fontSize: 12,
		color: '#D1D5DB',
		marginTop: 24,
		marginBottom: 40,
	},
});
