export const StatusColors = {
  finalized: '#22C55E',
  in_progress: '#3B82F6',
  payment_due: '#EF4444',
  scheduled: '#EAB308',
  cancelled: '#6B7280',
} as const;

export const StatusBackgrounds = {
  finalized: '#F0FDF4',
  in_progress: '#EFF6FF',
  payment_due: '#FEF2F2',
  scheduled: '#FEFCE8',
  cancelled: '#F9FAFB',
} as const;

export const HealthColors = {
  good: '#22C55E',
  warning: '#EAB308',
  critical: '#EF4444',
} as const;

/**
 * Palette for the AppointmentCard "Proposed change" variant (P5-CU-4).
 * Mapped from `ReorganizationSessionSource` (master plan §3.8.1) → who
 * authored the pending intent. Master plan §5.4.3 specifies purple/blue/
 * green for AI/FO/tech; customer-authored sessions are rare on the
 * customer's own list (the customer initiated them) but render with a
 * neutral slate so they're visually distinct from authored-by-staff.
 *
 * Keep these tokens here so the AppointmentCard variant stays compliant
 * with the "all status colors via shared color tokens" rule from
 * `.cursor/rules/architecture.mdc`.
 */
export const PendingSourceColors = {
  ai_suggestion: { color: '#7C3AED', background: '#F5F3FF', label: 'AI proposed' },
  franchise_dashboard: { color: '#3B82F6', background: '#EFF6FF', label: 'Franchise proposed' },
  tech_app: { color: '#22C55E', background: '#F0FDF4', label: 'Tech proposed' },
  // 'Sent for franchise review' is the canonical copy from master plan §5.4.7
  // (matches the customer-modal toast in P5-CU-3). Don't drift from this
  // wording — single-source-of-truth for customer-facing pending-change copy.
  customer_app: { color: '#64748B', background: '#F1F5F9', label: 'Sent for franchise review' },
} as const;

export type PendingSourceKey = keyof typeof PendingSourceColors;

export function getPendingSourceVisuals(source: PendingSourceKey) {
  return PendingSourceColors[source];
}

export function getHealthColor(score: number): string {
  if (score > 70) return HealthColors.good;
  if (score >= 40) return HealthColors.warning;
  return HealthColors.critical;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'paid':
      return StatusColors.finalized;
    case 'in_progress':
    case 'en_route':
    case 'arrived':
    case 'wrap_up':
      return StatusColors.in_progress;
    case 'created':
    case 'confirmed':
    case 'accepted':
      return StatusColors.scheduled;
    case 'cancelled':
      return StatusColors.cancelled;
    default:
      return StatusColors.cancelled;
  }
}

export function getStatusBackground(status: string): string {
  switch (status) {
    case 'completed':
    case 'paid':
      return StatusBackgrounds.finalized;
    case 'in_progress':
    case 'en_route':
    case 'arrived':
    case 'wrap_up':
      return StatusBackgrounds.in_progress;
    case 'created':
    case 'confirmed':
    case 'accepted':
      return StatusBackgrounds.scheduled;
    case 'cancelled':
      return StatusBackgrounds.cancelled;
    default:
      return StatusBackgrounds.cancelled;
  }
}

export const Theme = {
  colors: {
    primary: '#3B82F6',
    primaryDark: '#2563EB',
    secondary: '#6366F1',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    surfaceElevated: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#EAB308',
    white: '#FFFFFF',
    black: '#000000',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 5,
    },
  },
} as const;
