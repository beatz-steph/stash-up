"use client"

import { useEffect } from "react"
import { identifyUser } from "@/lib/analytics/client"

export function PostHogIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    identifyUser(userId)
  }, [userId])
  return null
}
