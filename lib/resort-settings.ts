import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type ResortSettings = {
  resort_name: string
  contact: string
  email: string
  address: string
  check_in_time: string
  check_out_time: string
  gcash_number: string
  bank_name: string
  bank_account_number: string
  facebook_url: string
}

// Used whenever the DB row can't be reached (offline, RLS misconfigured,
// row not seeded yet, etc.) so pages never break just because settings
// failed to load.
export const DEFAULT_RESORT_SETTINGS: ResortSettings = {
  resort_name: 'AquaVerde Beach Resort',
  contact: '+63 912 345 6789',
  email: 'info@aquaverde.ph',
  address: 'Sarangani, South Cotabato, PH',
  check_in_time: '2:00 PM',
  check_out_time: '12:00 PM',
  gcash_number: '',
  bank_name: '',
  bank_account_number: '',
  facebook_url: '',
}

// Wrapped in React's cache() so multiple components rendered in the same
// request (Navbar + Footer + page body, for example) share one query
// instead of each hitting Supabase separately.
export const getResortSettings = cache(async (): Promise<ResortSettings> => {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('resort_settings')
      .select('resort_name, contact, email, address, check_in_time, check_out_time, gcash_number, bank_name, bank_account_number, facebook_url')
      .eq('id', 1)
      .single()

    if (error || !data) return DEFAULT_RESORT_SETTINGS

    return {
      resort_name: data.resort_name ?? DEFAULT_RESORT_SETTINGS.resort_name,
      contact: data.contact ?? DEFAULT_RESORT_SETTINGS.contact,
      email: data.email ?? DEFAULT_RESORT_SETTINGS.email,
      address: data.address ?? DEFAULT_RESORT_SETTINGS.address,
      check_in_time: data.check_in_time ?? DEFAULT_RESORT_SETTINGS.check_in_time,
      check_out_time: data.check_out_time ?? DEFAULT_RESORT_SETTINGS.check_out_time,
      gcash_number: data.gcash_number ?? DEFAULT_RESORT_SETTINGS.gcash_number,
      bank_name: data.bank_name ?? DEFAULT_RESORT_SETTINGS.bank_name,
      bank_account_number: data.bank_account_number ?? DEFAULT_RESORT_SETTINGS.bank_account_number,
      facebook_url: data.facebook_url ?? DEFAULT_RESORT_SETTINGS.facebook_url,
    }
  } catch {
    return DEFAULT_RESORT_SETTINGS
  }
})
