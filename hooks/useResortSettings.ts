'use client'

import { useEffect, useState } from 'react'

export interface ResortSettings {
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

// Same shape/values as lib/resort-settings.ts DEFAULT_RESORT_SETTINGS — kept
// as a plain literal here so client components render sensible receipt/
// header text immediately, before the /api/settings fetch resolves.
const FALLBACK: ResortSettings = {
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

export function useResortSettings() {
  const [settings, setSettings] = useState<ResortSettings>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/api/settings')
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json?.data) return
        const d = json.data
        setSettings({
          resort_name: d.resort_name ?? FALLBACK.resort_name,
          contact: d.contact ?? FALLBACK.contact,
          email: d.email ?? FALLBACK.email,
          address: d.address ?? FALLBACK.address,
          check_in_time: d.check_in_time ?? FALLBACK.check_in_time,
          check_out_time: d.check_out_time ?? FALLBACK.check_out_time,
          gcash_number: d.gcash_number ?? FALLBACK.gcash_number,
          bank_name: d.bank_name ?? FALLBACK.bank_name,
          bank_account_number: d.bank_account_number ?? FALLBACK.bank_account_number,
          facebook_url: d.facebook_url ?? FALLBACK.facebook_url,
        })
      })
      .catch(() => {
        // keep FALLBACK — a failed settings fetch shouldn't block printing a receipt
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { settings, loading }
}
