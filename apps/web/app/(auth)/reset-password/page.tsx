import { ResetPasswordForm } from "@/features/auth/forms/reset-password"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetPasswordForm token={token} />
}
