"use client"
import { createContext, useContext, ReactNode } from "react"
import { useRealtimeInvalidation } from "@/features/realtime/use-realtime-invalidation"

const OnboardingContext = createContext<boolean>(false)

export function OnboardingProvider({ children, isOnboarded }: { children: ReactNode, isOnboarded: boolean }) {
  // Mounted once here (top of the dashboard's client provider tree) so every
  // page under app/(dashboard)/ gets notification-driven query invalidation
  // without each page needing to know about it.
  useRealtimeInvalidation()

  return (
    <OnboardingContext.Provider value={isOnboarded}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useIsOnboarded() {
  return useContext(OnboardingContext)
}
