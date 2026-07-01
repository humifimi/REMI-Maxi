import { canManageRoles } from '../app-mode';
import { UserRole } from '@technician/types/enums';

describe('canManageRoles', () => {
  it('allows administrators to manage roles and permissions', () => {
    expect(canManageRoles(UserRole.ADMINISTRATOR)).toBe(true);
  });

  it('denies non-admin roles access to role and permission management', () => {
    expect(canManageRoles(UserRole.FRANCHISE_OWNER)).toBe(false);
    expect(canManageRoles(UserRole.FRANCHISOR)).toBe(false);
    expect(canManageRoles(UserRole.CUSTOMER)).toBe(false);
    expect(canManageRoles(undefined)).toBe(false);
  });
});
