// Role-based access control configuration.
// MODULE_ACCESS controls sidebar visibility (which pages a role can open).
// ACTION_PERMISSIONS controls fine-grained capabilities WITHIN a page
// (e.g. Housekeeping can open the Housekeeping page, but can't create
// new tasks — only view/update the ones assigned to them).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

export const MODULE_ACCESS: Record<string, Role[]> = {
  dashboard:      ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'staff', 'housekeeping', 'maintenance', 'restaurant'],
  bookings:       ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  walkin:         ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  checkinout:     ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  rooms:          ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  cottages:       ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  dayuse:         ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  pos:            ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  restaurant:     ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'restaurant'],
  housekeeping:   ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'housekeeping'],
  maintenance:    ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'maintenance'],
  inventory:      ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  equipment:      ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  guests:         ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  staff:          ['super_admin', 'resort_owner'],
  billing:        ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
  reports:        ['super_admin', 'resort_owner'],
  settings:       ['super_admin', 'resort_owner'],
  activitylog:    ['super_admin', 'resort_owner'],
  remittance:     ['super_admin', 'resort_owner', 'front_desk', 'cashier'],
}

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

// ---------------------------------------------------------------------------
// ACTION-LEVEL PERMISSIONS
// Finer grained than module access — these gate specific buttons/actions
// within a page that's otherwise accessible to a role.
// ---------------------------------------------------------------------------

export const ACTION_PERMISSIONS = {
  // Housekeeping tasks — front_desk and cashier can create/assign tasks
  canCreateHousekeepingTask: ['super_admin', 'resort_owner', 'front_desk', 'cashier'] as Role[],
  canViewRevenueStats:       ['super_admin', 'resort_owner', 'front_desk', 'cashier'] as Role[],

  // Equipment catalog — admin only can add/edit/remove equipment types
  // Front desk and cashier can still rent out/return
  canManageEquipmentCatalog: ['super_admin', 'resort_owner'] as Role[],

  // Restaurant kitchen orders — front_desk and cashier can advance/cancel
  canManageKitchenOrders:    ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'restaurant'] as Role[],

  // Rooms — admin only can add/edit/delete rooms and room types
  // Front desk can only view and change status (available/cleaning/etc.)
  canManageRoomsCatalog:     ['super_admin', 'resort_owner'] as Role[],

  // Cottages — admin only can add/edit/delete cottages
  // Front desk can only view and change status
  canManageCottagesCatalog:  ['super_admin', 'resort_owner'] as Role[],

  // Inventory — admin only can add new items and remove/deactivate items
  // Front desk can still do stock in/out movements
  canManageInventoryCatalog: ['super_admin', 'resort_owner'] as Role[],
} as const

export type ActionPermission = keyof typeof ACTION_PERMISSIONS

export function hasPermission(role: string | undefined | null, permission: ActionPermission): boolean {
  if (!role) return false
  if (FULL_ACCESS_ROLES.includes(role as Role)) return true
  return (ACTION_PERMISSIONS[permission] as readonly Role[]).includes(role as Role)
}

// ---------------------------------------------------------------------------
// React hook — convenient role + permission access inside components.
// Usage: const { role, can } = usePermissions(); if (can('canCreateHousekeepingTask')) ...
// ---------------------------------------------------------------------------

export function usePermissions() {
  const [role, setRole] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => setRole(data?.role ?? null))
    })
  }, [])

  return {
    role,
    can: (permission: ActionPermission) => hasPermission(role, permission),
    canAccessModule: (moduleId: string) => canAccess(role, moduleId),
  }
}
