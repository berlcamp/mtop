"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "./use-auth"
import React from "react"

interface UserProfile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  office_id: string | null
  office?: {
    id: string
    name: string
    code: string
  } | null
}

interface ProfileContextType {
  profile: UserProfile | null
  isLoading: boolean
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isLoading: true,
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setIsLoading(false)
      return
    }

    const fetchProfile = async () => {
      const { data } = await supabase
        .schema("mtop")
        .from("user_profiles")
        .select(
          `
          id,
          full_name,
          email,
          avatar_url,
          office_id,
          office:offices (id, name, code)
        `
        )
        .eq("id", user.id)
        .single()

      setProfile(data as unknown as UserProfile)
      setIsLoading(false)
    }

    fetchProfile()
  }, [user, supabase])

  return React.createElement(
    ProfileContext.Provider,
    { value: { profile, isLoading } },
    children
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
