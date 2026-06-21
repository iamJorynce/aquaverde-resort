import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// This route uses the SERVICE ROLE key, which has full admin access to
// Supabase Auth. It must only ever run on the server — never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser. Next.js API routes run on the
// server by default, so this is safe as long as the key is only read here
// via process.env (not prefixed with NEXT_PUBLIC_).

const ALLOWED_CREATOR_ROLES = ['super_admin', 'resort_owner']

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the person calling this is logged in and is an admin.
    // We check using the regular (non-admin) server client, which respects
    // the caller's own session/cookies.
    const supabaseAsCaller = await createServerClient()
    const { data: { user: callerUser } } = await supabaseAsCaller.auth.getUser()

    if (!callerUser) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const { data: callerProfile } = await supabaseAsCaller
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile || !ALLOWED_CREATOR_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only Super Admin or Resort Owner can create staff accounts.' }, { status: 403 })
    }

    // 2. Parse and validate input.
    const body = await request.json()
    const { email, password, full_name, role, department, position, shift, hire_date } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Email, password, full name, and role are required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    // 3. Use the admin client (service role key) to create the auth user.
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification — staff accounts are pre-trusted
      user_metadata: { full_name },
    })

    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message ?? 'Failed to create user.' }, { status: 400 })
    }

    // 4. The on_auth_user_created trigger auto-creates a `profiles` row with
    // role='guest'. Update it now with the real role and name.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role, full_name })
      .eq('id', newUser.user.id)

    if (profileError) {
      return NextResponse.json({ error: 'User created but profile update failed: ' + profileError.message }, { status: 500 })
    }

    // 5. Create the staff record.
    const employeeCode = `EMP-${Date.now().toString().slice(-5)}`
    const { error: staffError } = await supabaseAdmin
      .from('staff')
      .insert({
        profile_id: newUser.user.id,
        employee_code: employeeCode,
        department: department || null,
        position: position || null,
        shift: shift || 'AM',
        hire_date: hire_date || new Date().toISOString().slice(0, 10),
      })

    if (staffError) {
      return NextResponse.json({ error: 'User and profile created, but staff record failed: ' + staffError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user_id: newUser.user.id,
      employee_code: employeeCode,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected server error.' }, { status: 500 })
  }
}
