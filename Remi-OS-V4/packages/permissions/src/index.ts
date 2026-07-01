/**
 * Role-based permissions — technician, customer, fleet-manager, operator.
 */
export type RemiRole = 'technician' | 'customer' | 'fleet-manager' | 'operator';

export function roleFromUser(_user: unknown): RemiRole {
  return 'technician';
}
