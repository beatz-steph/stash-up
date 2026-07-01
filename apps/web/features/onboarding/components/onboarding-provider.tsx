"use client"
import { createContext, useContext, ReactNode } from "react"

const OnboardingContext = createContext<boolean>(false)

export function OnboardingProvider({ children, isOnboarded }: { children: ReactNode, isOnboarded: boolean }) {
  return (
    <OnboardingContext.Provider value={isOnboarded}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useIsOnboarded() {
  return useContext(OnboardingContext)
}
