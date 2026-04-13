import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Get the authenticated user
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Check if this user has a pre-approved profile in mtop.user_profiles
        const { data: profile } = await supabase
          .schema("mtop")
          .from("user_profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle()

        if (profile) {
          // User exists — allow access
          const forwardedHost = request.headers.get("x-forwarded-host")
          const isLocalEnv = process.env.NODE_ENV === "development"

          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${next}`)
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${next}`)
          } else {
            return NextResponse.redirect(`${origin}${next}`)
          }
        }

        // Check if there's a pre-registered profile by email (admin added them before first login)
        const { data: preRegistered } = await supabase
          .schema("mtop")
          .from("user_profiles")
          .select("id, email")
          .eq("email", user.email!)
          .maybeSingle()

        if (preRegistered && preRegistered.id !== user.id) {
          // Profile was pre-created with a placeholder ID — update it to the real auth user ID
          // This happens when admin adds a user by email before they ever log in.
          // We need to use the admin client for this since the profile ID is a FK to auth.users
          // Instead, we'll handle this by having admin create profiles with the email,
          // and on first login we insert the actual profile with the auth user's ID.

          // Delete the placeholder and create with real ID
          const { createAdminClient } = await import(
            "@/lib/supabase/admin"
          )
          const adminSupabase = createAdminClient()

          // Copy the pre-registered data
          const { data: fullProfile } = await adminSupabase
            .from("user_profiles")
            .select("*")
            .eq("email", user.email!)
            .single()

          if (fullProfile) {
            // Get their roles
            const { data: preRoles } = await adminSupabase
              .from("user_roles")
              .select("role_id")
              .eq("user_id", fullProfile.id)

            // Delete placeholder profile (cascades user_roles)
            await adminSupabase
              .from("user_roles")
              .delete()
              .eq("user_id", fullProfile.id)

            await adminSupabase
              .from("user_profiles")
              .delete()
              .eq("id", fullProfile.id)

            // Create real profile with auth user ID
            await adminSupabase
              .from("user_profiles")
              .insert({
                id: user.id,
                full_name:
                  fullProfile.full_name ||
                  user.user_metadata?.full_name ||
                  user.email,
                email: user.email!,
                avatar_url:
                  user.user_metadata?.avatar_url || fullProfile.avatar_url,
                office_id: fullProfile.office_id,
                division_id: fullProfile.division_id,
              })

            // Re-assign roles
            if (preRoles && preRoles.length > 0) {
              await adminSupabase
                .from("user_roles")
                .insert(
                  preRoles.map((r: { role_id: string }) => ({
                    user_id: user.id,
                    role_id: r.role_id,
                  }))
                )
            }

            const forwardedHost = request.headers.get("x-forwarded-host")
            const isLocalEnv = process.env.NODE_ENV === "development"

            if (isLocalEnv) {
              return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
              return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
              return NextResponse.redirect(`${origin}${next}`)
            }
          }
        }

        // No profile found — unauthorized. Sign them out.
        await supabase.auth.signOut()
        return NextResponse.redirect(
          `${origin}/auth?error=unauthorized`
        )
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=auth_callback_error`)
}
