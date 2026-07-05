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

/** POST /api/wallet/topup — start a card top-up. amountMinor is what the user
 * wants credited; they pay amountMinor + card fee. Pass `savedCardId` to charge
 * an existing saved card (server-initiated); omit it for a new card (hosted
 * checkout redirect). */
export const WalletTopupReqSchema = z.object({
  amountMinor: z.number().int().min(10_000), // ₦100 minimum
  savedCardId: z.string().min(1).optional(),
});
export type WalletTopupReq = z.infer<typeof WalletTopupReqSchema>;

export const WalletTopupResSchema = z.object({
  // "checkout" → redirect the user to checkoutLink (new card).
  // "charged"  → the saved card is being charged; balance updates on settlement.
  mode: z.enum(["checkout", "charged"]),
  checkoutLink: z.string().nullable(),
  netMinor: z.number().int(), // credited to the wallet
  feeMinor: z.number().int(), // card fee added on top
  chargedMinor: z.number().int(), // net + fee — what the card is charged
});
export type WalletTopupRes = z.infer<typeof WalletTopupResSchema>;

/** POST /api/wallet/withdraw — pay out to the linked bank. amountMinor is what
 * the user receives; the transfer fee is debited on top. PIN required. */
export const WalletWithdrawReqSchema = z.object({
  amountMinor: z.number().int().positive(),
  pin: z.string(),
});
export type WalletWithdrawReq = z.infer<typeof WalletWithdrawReqSchema>;

export const WalletWithdrawResSchema = z.object({
  withdrawalId: z.string(),
  status: z.string(),
  amountMinor: z.number().int(),
  feeMinor: z.number().int(),
});
export type WalletWithdrawRes = z.infer<typeof WalletWithdrawResSchema>;
