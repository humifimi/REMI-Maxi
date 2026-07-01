export const CALENDAR_CONFIG = {
	DEFAULT_START_HOUR: 6,
	DEFAULT_END_HOUR: 20,
	MIN_ZOOM_HOURS: 4,
	MAX_ZOOM_HOURS: 16,
	DEFAULT_ZOOM_HOURS: 10,
	DRAG_STEP_MINUTES: 15,
	STALE_TIME_MS: 30_000,
	REFETCH_INTERVAL_MS: 60_000,
} as const;

export type CalendarDensity = 'none' | 'height' | 'width' | 'both';

const SPACIOUS_HOUR_HEIGHT = 80;
const DENSE_HOUR_HEIGHT = 50;
const SPACIOUS_DAY_COLUMNS = 3;

export const DENSITY_CYCLE: CalendarDensity[] = [
	'none',
	'height',
	'width',
	'both',
];

export function getDensityHourHeight(d: CalendarDensity): number {
	return d === 'height' || d === 'both'
		? DENSE_HOUR_HEIGHT
		: SPACIOUS_HOUR_HEIGHT;
}

export function isDenseWidth(d: CalendarDensity): boolean {
	return d === 'width' || d === 'both';
}

export function getBaseDayColumns(d: CalendarDensity): number {
	return isDenseWidth(d) ? Infinity : SPACIOUS_DAY_COLUMNS;
}

export const SLOT_TYPE_COLORS = {
	standard: { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
	eco: { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
	priority: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
	flex_window: { bg: '#F5F3FF', border: '#8B5CF6', text: '#5B21B6' },
} as const;

export const ALERT_SEVERITY_COLORS = {
	info: '#3B82F6',
	warning: '#F59E0B',
	critical: '#EF4444',
} as const;

export const BOOKING_METHOD_LABELS = {
	manual: 'Manual',
	generated: 'AI Suggested',
	batch: 'Fleet Batch',
	recurring: 'Recurring',
} as const;

export const NOTIFICATION_PREF_OPTIONS = [
	{ value: 'email_and_text', label: 'Email & Text' },
	{ value: 'text', label: 'Text Only' },
	{ value: 'email', label: 'Email Only' },
	{ value: 'none', label: 'No Notification' },
] as const;
