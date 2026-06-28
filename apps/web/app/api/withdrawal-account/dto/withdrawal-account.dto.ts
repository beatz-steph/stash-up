import { z } from "zod"

export const WithdrawalAccountSchema = z.object({
  bankCode: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
})
export type WithdrawalAccount = z.infer<typeof WithdrawalAccountSchema>

export const SaveWithdrawalAccountReqSchema = z.object({
  bankCode: z.string().min(1, "Bank selection is required"),
  bankName: z.string().min(1, "Bank name is required"),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
  accountName: z.string().min(1, "Account name is required"),
})
export type SaveWithdrawalAccountReq = z.infer<typeof SaveWithdrawalAccountReqSchema>

export const ResolveAccountReqSchema = z.object({
  bankCode: z.string().min(1, "Bank selection is required"),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
})
export type ResolveAccountReq = z.infer<typeof ResolveAccountReqSchema>

export const ResolveAccountResSchema = z.object({
  accountName: z.string(),
})
export type ResolveAccountRes = z.infer<typeof ResolveAccountResSchema>
