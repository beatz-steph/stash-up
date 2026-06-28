import React from "react"
import Waves from "@workspace/ui/extra/Waves.jsx"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen w-full bg-su-canvas">
      {/* Left Column - Desktop Only full-bleed placeholder image */}
      <div className="relative hidden w-1/2  lg:block lg:w-[45%] h-screen  p-4">
        <div className="h-full w-full bg-su-surface-dark rounded-2xl overflow-hidden relative pr-0">
          <Waves lineColor="#0052ff"
            backgroundColor="transparent"
            waveSpeedX={0.0125}
            waveSpeedY={0.01}
            waveAmpX={40}
            waveAmpY={20}
            friction={0.9}
            tension={0.01}
            maxCursorMove={120}
            xGap={12}
            yGap={36} />
        </div>
      </div>

      {/* Right Column - Form Container */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-8 lg:w-[55%]">
        <div className="mx-auto w-full max-w-100">
          {children}
        </div>
      </div>
    </div>
  )
}
