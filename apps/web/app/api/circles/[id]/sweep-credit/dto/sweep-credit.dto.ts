import { z } from "zod";

/**
 * POST /api/circles/[id]/sweep-credit — move the member's leftover circle
 * credit (bufferMinor) to their wallet. No request body: it sweeps whatever
 * credit they're carrying on this circle. For the rare case where a payment
 * settles AFTER the circle completed, so the auto-sweep at completion already ran.
 */
export const SweepCreditResSchema = z.object({
  creditedMinor: z.number().int(), // amount moved to the wallet (0 if none)
  balanceAfterMinor: z.number().int(), // wallet balance after the sweep
});
export type SweepCreditRes = z.infer<typeof SweepCreditResSchema>;
