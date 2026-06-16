import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

export function useRealtimeBookings() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('bookings-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rooms'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['rooms'] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'housekeeping_tasks'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['housekeeping'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, queryClient])
}
