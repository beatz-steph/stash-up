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
 * wants credited; they pay amountMinor + card fee. Cards are never saved, so
 * every top-up is a one-time hosted-checkout redirect. */
export const WalletTopupReqSchema = z.object({
  amountMinor: z.number().int().min(10_000), // ₦100 minimum
});
export type WalletTopupReq = z.infer<typeof WalletTopupReqSchema>;

export const WalletTopupResSchema = z.object({
  // Always "checkout" — redirect the user to checkoutLink; the wallet is
  // credited on settlement. (Kept as an enum for a stable client shape.)
  mode: z.literal("checkout"),
  checkoutLink: z.string(),
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
