/**
 * Shared types — re-exported from the unified mobile app.
 */
export type {
  ApiResponse,
  AuthUser,
  LoginResponse,
  TokenPair,
} from '../../../apps/mobile/src/modes/technician/types/api';

export {
  UserRole,
  UserStatus,
  AppointmentStatus,
} from '../../../apps/mobile/src/modes/technician/types/enums';

export type {
  AuthUser as CustomerAuthUser,
  LoginResponse as CustomerLoginResponse,
} from '../../../apps/mobile/src/modes/customer/types/api';
