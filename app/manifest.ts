import type { MetadataRoute } from 'next'
import { getResortSettings } from '@/lib/resort-settings'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getResortSettings()
  return {
    name: settings.resort_name,
    short_name: settings.resort_name,
    description: 'Beach Resort Management System',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0C447C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
