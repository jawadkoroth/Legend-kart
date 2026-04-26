'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function Callback() {
  const router = useRouter()

  useEffect(() => {
    const handle = async () => {
      const supabase = createClient()

      // 🔥 THIS IS REQUIRED TO STORE SESSION
      await supabase.auth.getSession()

      router.replace("/profile")
    }

    handle()
  }, [])

  return null
}
