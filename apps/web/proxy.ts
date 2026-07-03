import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Define public routes that do not require authentication
const publicRoutes = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]

// Define API routes that are meant to be publicly accessible (e.g., auth handlers, webhooks)
const publicApiRoutes = ["/api/auth", "/api/username-available", "/api/webhooks/nomba"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith("/api")

  // Allow access to public routes
  if (
    publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    publicApiRoutes.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.next()
  }

  // Check for session cookie presence
  const sessionToken = getSessionCookie(request)

  if (!sessionToken) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    } else {
      return NextResponse.redirect(new URL("/sign-in", request.url))
    }
  }

  return NextResponse.next()
}

// Specify the paths the middleware should run on.
// Exclude static files, images, and next internals.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
