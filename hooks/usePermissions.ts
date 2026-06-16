import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Role = 'super_admin'|'resort_owner'|'front_desk'|'cashier'|
            'staff'|'housekeeping'|'maintenance'|'restaurant'|'guest'

const PERMISSIONS = {
  canManageBookings:  ['super_admin','resort_owner','front_desk','cashier'],
  canManageRooms:     ['super_admin','resort_owner','front_desk'],
  canAccessPOS:       ['super_admin','resort_owner','front_desk','cashier'],
  canViewReports:     ['super_admin','resort_owner'],
  canManageStaff:     ['super_admin','resort_owner'],
  canManageInventory: ['super_admin','resort_owner','front_desk'],
  canViewAuditLogs:   ['super_admin'],
  canManageSettings:  ['super_admin','resort_owner'],
  canDoHousekeeping:  ['super_admin','resort_owner','front_desk','housekeeping'],
  canDoMaintenance:   ['super_admin','resort_owner','front_desk','maintenance'],
  canManageRestaurant:['super_admin','resort_owner','front_desk','cashier','restaurant'],
}

export function usePermissions() {
  const [role, setRole] = useState<Role | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => setRole(data?.role ?? null))
    })
  }, [])

  const can = (permission: keyof typeof PERMISSIONS) =>
    role ? PERMISSIONS[permission].includes(role) : false

  return { role, can }
}
