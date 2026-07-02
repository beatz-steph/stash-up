import { prisma } from "@workspace/db";
import type { Prisma } from "@workspace/db";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * True only when an operator has explicitly toggled the Nomba integration to
 * INVALID (admin settings). Fail-open by design: a MISSING config row never
 * disables the integration, so a fresh DB / un-seeded config can't brick payouts
 * or VA provisioning. This is the single source of that fail-open rule — callers
 * must not re-derive it inline.
 */
export async function isNombaIntegrationDisabled(client: DbClient = prisma): Promise<boolean> {
  const config = await client.nombaConfig.findFirst();
  return config?.status === "INVALID";
}
