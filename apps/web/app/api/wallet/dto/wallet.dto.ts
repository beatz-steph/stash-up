import { z } from "zod";

export const WalletVirtualAccountSchema = z.object({
  bankAccountNumber: z.string(),
  bankAccountName: z.string(),
  bankName: z.string(),
});

export const WalletLedgerEntrySchema = z.object({
  id: z.string(),
  direction: z.enum(["CREDIT", "DEBIT"]),
  amountMinor: z.number().int(),
  balanceAfterMinor: z.number().int(),
  source: z.string(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});

export const WalletResSchema = z.object({
  balanceMinor: z.number().int(),
  // null until the user provisions a bank top-up account (lazy).
  virtualAccount: WalletVirtualAccountSchema.nullable(),
  entries: z.array(WalletLedgerEntrySchema),
});
export type WalletRes = z.infer<typeof WalletResSchema>;
export type WalletLedgerEntryDto = z.infer<typeof WalletLedgerEntrySchema>;

/** POST /api/wallet/virtual-account — provision (or return) the top-up VA. */
export const WalletVirtualAccountResSchema = WalletVirtualAccountSchema;
export type WalletVirtualAccountRes = z.infer<typeof WalletVirtualAccountResSchema>;
