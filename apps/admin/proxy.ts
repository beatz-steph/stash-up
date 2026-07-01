import { NextResponse, type NextRequest } from "next/server"
import { getCookieCache } from "better-auth/cookies"

const publicRoutes = ["/sign-in"]
const publicApiRoutes = ["/api/auth"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith("/api")

  if (
    publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    publicApiRoutes.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.next()
  }

  const session = await getCookieCache(request)

  if (!session) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    } else {
      return NextResponse.redirect(new URL("/sign-in", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
