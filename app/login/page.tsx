'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useResortSettings } from '@/hooks/useResortSettings'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { settings: resortSettings } = useResortSettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0F2626 0%, #163434 55%, #0C1F1F 100%)' }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Work+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      {/* Ambient glow accents, echoing the navbar gradient */}
      <div
        className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: '#C97B4A' }}
      />
      <div
        className="absolute -bottom-40 -right-24 w-[480px] h-[480px] rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: '#1F6E63' }}
      />

      <div className="relative w-full max-w-md px-6">
        {/* Logo */}
       
<div className="text-center mb-8">
  <div
    className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full mb-4 bg-white overflow-hidden shadow-sm"
  >
    <img
      src="/images/logo.png"
      alt={resortSettings.resort_name}
      className="w-full h-full object-contain p-2"
    />
  </div>

  <h1
    className="text-2xl md:text-[28px] text-white tracking-wide"
    style={{
      fontFamily: 'Fraunces, serif',
      fontWeight: 500,
    }}
  >
    {resortSettings.resort_name}
  </h1>

  <p
    className="text-white/60 text-sm mt-1.5 tracking-wide"
    style={{
      fontFamily: 'Work Sans, sans-serif',
    }}
  >
  </p>
</div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: '#FAF6EF' }}
        >
          <h2
            className="text-lg mb-6 text-[#0F2626]"
            style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}
          >
            Sign in to your account
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-[#C97B4A]/10 border border-[#C97B4A]/30 rounded-lg text-[#B15A2B] text-sm"
              style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            <div>
              <label className="block text-sm font-medium text-[#0F2626]/80 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@resort.com"
                required
                className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm text-[#0F2626] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6E63] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F2626]/80 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 border border-black/10 rounded-lg text-sm text-[#0F2626] bg-white focus:outline-none focus:ring-2 focus:ring-[#1F6E63] focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-full text-sm font-medium tracking-wide transition-all hover:brightness-110 disabled:opacity-60 text-white"
              style={{ background: '#C97B4A', fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-[#0F2626]/40 mt-6" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Forgot your password? Please contact the resort administrator for assistance.
          </p>
        </div>
      </div>
    </div>
  )
}
