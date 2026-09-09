import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  // Pin the workspace root explicitly. Without this, Turbopack found a
  // stray package-lock.json one level up (in the Windows user profile
  // folder) and got confused about which directory is the real project
  // root, causing erratic 404s on nested/API routes even though the
  // route files themselves are correct.
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
