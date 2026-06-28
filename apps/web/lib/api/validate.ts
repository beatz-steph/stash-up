import { NextResponse } from "next/server"
import { z } from "zod"

export type ValidationResult<T> =
  | { success: true; data: T; errorResponse?: undefined }
  | { success: false; data?: undefined; errorResponse: NextResponse }

/**
 * Validates a request body against a Zod schema.
 * Returns the parsed data on success, or a ready-to-return NextResponse on failure.
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ValidationResult<T>> {
  const json: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(json)
  
  if (!parsed.success) {
    return {
      success: false,
      errorResponse: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    }
  }

  return {
    success: true,
    data: parsed.data,
  }
}
