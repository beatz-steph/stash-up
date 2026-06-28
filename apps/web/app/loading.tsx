import { LogoLoader } from "@workspace/ui/components/logo-loader"

export default function Loading() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-su-canvas">
      <LogoLoader fullPage size="lg" />
    </div>
  )
}
