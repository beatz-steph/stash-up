import { z } from "zod";

/** POST /api/circles/[id]/auto-debit/wallet — opt in/out of wallet auto-save.
 * Auto-collection for a circle draws ONLY from the wallet balance (there are no
 * saved cards). Card is a one-time, member-initiated payment via hosted
 * checkout — never an unattended debit. */
export const ToggleWalletAutoDebitReqSchema = z.object({
  enabled: z.boolean(),
});
export type ToggleWalletAutoDebitReq = z.infer<typeof ToggleWalletAutoDebitReqSchema>;

export const ToggleWalletAutoDebitResSchema = z.object({
  autoDebitWallet: z.boolean(),
  /** amount immediately pulled from the wallet toward this cycle, if any. */
  collectedMinor: z.number().int(),
});
export type ToggleWalletAutoDebitRes = z.infer<typeof ToggleWalletAutoDebitResSchema>;
