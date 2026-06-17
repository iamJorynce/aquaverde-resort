// Role-based access control configuration
// Defines which navigation items each role can see and use.

export type Role =
  | 'super_admin'
  | 'resort_owner'
  | 'front_desk'
  | 'cashier'
  | 'staff'
  | 'housekeeping'
  | 'maintenance'
  | 'restaurant'
  | 'guest'

// Each module ID maps to the list of roles allowed to access it.
// super_admin and resort_owner always have full access (handled in code, not listed every time).
export const MODULE_ACCESS: Record<string, Role[]> = {
  dashboard:      ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'staff', 'housekeeping', 'maintenance', 'restaurant'],
  bookings:       ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  walkin:         ['super_admin', 'resort_owner', 'front_desk'],
  checkinout:     ['super_admin', 'resort_owner', 'front_desk'],
  rooms:          ['super_admin', 'resort_owner', 'front_desk'],
  cottages:       ['super_admin', 'resort_owner', 'front_desk'],
  dayuse:         ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  pos:            ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  restaurant:     ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'restaurant'],
  housekeeping:   ['super_admin', 'resort_owner', 'front_desk', 'housekeeping'],
  maintenance:    ['super_admin', 'resort_owner', 'front_desk', 'maintenance'],
  inventory:      ['super_admin', 'resort_owner', 'front_desk'],
  equipment:      ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  guests:         ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  staff:          ['super_admin', 'resort_owner'],
  billing:        ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  reports:        ['super_admin', 'resort_owner'],
  settings:       ['super_admin', 'resort_owner'],
}

// Roles that always see everything, no need to list them per module above.
const FULL_ACCESS_ROLES: Role[] = ['super_admin', 'resort_owner']

export function canAccess(role: string | undefined | null, moduleId: string): boolean {
  if (!role) return false
  if (FULL_ACCESS_ROLES.includes(role as Role)) return true
  const allowed = MODULE_ACCESS[moduleId]
  if (!allowed) return false
  return allowed.includes(role as Role)
}

export function getAccessibleModules(role: string | undefined | null): string[] {
  if (!role) return []
  if (FULL_ACCESS_ROLES.includes(role as Role)) return Object.keys(MODULE_ACCESS)
  return Object.keys(MODULE_ACCESS).filter(m => MODULE_ACCESS[m].includes(role as Role))
}

// Friendly display name for roles, used in the topbar badge.
export const ROLE_LABELS: Record<string, string> = {
  super_admin:  'Super Admin',
  resort_owner: 'Resort Owner',
  front_desk:   'Front Desk',
  cashier:      'Cashier',
  staff:        'Staff',
  housekeeping: 'Housekeeping',
  maintenance:  'Maintenance',
  restaurant:   'Restaurant',
  guest:        'Guest',
}
