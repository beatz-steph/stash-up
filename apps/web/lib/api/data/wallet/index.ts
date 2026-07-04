import { api, type ApiOptions } from "../../client";
import type { WalletRes, WalletVirtualAccountRes } from "@/app/api/wallet/dto/wallet.dto";

/** The signed-in user's wallet: balance, top-up VA (if provisioned), ledger. */
export function fetchWallet(options?: ApiOptions) {
  return api.get<WalletRes>("/api/wallet", options);
}

/** Provision (or return) the user's dedicated bank top-up account. */
export function provisionWalletAccount(options?: ApiOptions) {
  return api.post<WalletVirtualAccountRes>("/api/wallet/virtual-account", undefined, options);
}
