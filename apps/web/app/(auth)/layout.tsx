import React from "react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen w-full bg-su-canvas">
      {/* Left Column - Desktop Only full-bleed placeholder image */}
      <div className="relative hidden w-1/2 bg-su-surface-dark lg:block lg:w-[45%] h-screen overflow-hidden">
        {/* image supplied later */}
        {/* 
          import Image from "next/image"
          <Image 
            src="/placeholder-auth.jpg" 
            alt="Stashup Auth Image" 
            fill 
            className="object-cover" 
            priority
          /> 
        */}
      </div>

      {/* Right Column - Form Container */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-8 lg:w-[55%]">
        <div className="mx-auto w-full max-w-[400px]">
          {children}
        </div>
      </div>
    </div>
  )
}
