import { auth } from "./lib/auth"

async function test() {
  const email = "tester4@example.com"
  
  console.log("Signing up user...")
  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password: "Password123!",
        name: "Test User",
        firstName: "Test",
        lastName: "User",
        username: "tester4",
      },
      headers: new Headers({ "x-forwarded-for": "127.0.0.1" })
    })
    console.log("Sign up response successful")
  } catch (e) {
    console.error("Sign up failed:", e)
  }

  console.log("Requesting password reset...")
  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: "http://localhost:3000/reset-password",
      },
      headers: new Headers({ "x-forwarded-for": "127.0.0.1" })
    })
    console.log("Password reset requested")
  } catch (e) {
    console.error("Password reset failed:", e)
  }
}

test()
