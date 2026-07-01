import { NextResponse } from "next/server";
import { z } from "zod";

export type ApiResponse<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

/** Generic success response schema for endpoints that return `{ success: true }` */
export const SuccessResSchema = z.object({
  success: z.boolean(),
});

export function apiSuccess<T>(data: T, status = 200, message?: string) {
  return NextResponse.json({ success: true, data, message }, { status });
}

export function apiError(error: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}
