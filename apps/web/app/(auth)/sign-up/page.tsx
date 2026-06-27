import { SignUpForm } from "@/features/auth/forms/sign-up"

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-slate-100">
      {/* Dynamic Background Gradients */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-pink-500/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 font-bold text-white shadow-lg shadow-indigo-500/20">
            SU
          </div>
          <span className="text-xl font-bold tracking-wider uppercase bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
            StashUp
          </span>
        </div>
        <SignUpForm />
      </div>
    </div>
  )
}
