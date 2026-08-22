import type { ResortInfo } from './templates.ts'

const DEFAULT_RESORT_INFO: ResortInfo = {
  name: 'Sea Eagle Beach Resort',
  phone: Deno.env.get('RESORT_PHONE') ?? '+63 912 345 6789',
  checkInTime: '2:00 PM',
  checkOutTime: '12:00 PM',
}

// `supabase` here must be a client created with the service role key
// (RLS restricts UPDATE on resort_settings to admins, but every one of
// these functions already builds a service-role client to read bookings
// etc., so this reuses that same client instead of creating a new one).
export async function getResortInfo(supabase: any): Promise<ResortInfo> {
  try {
    const { data, error } = await supabase
      .from('resort_settings')
      .select('resort_name, contact, check_in_time, check_out_time')
      .eq('id', 1)
      .single()

    if (error || !data) return DEFAULT_RESORT_INFO

    return {
      name: data.resort_name ?? DEFAULT_RESORT_INFO.name,
      phone: data.contact ?? DEFAULT_RESORT_INFO.phone,
      checkInTime: data.check_in_time ?? DEFAULT_RESORT_INFO.checkInTime,
      checkOutTime: data.check_out_time ?? DEFAULT_RESORT_INFO.checkOutTime,
    }
  } catch {
    return DEFAULT_RESORT_INFO
  }
}
