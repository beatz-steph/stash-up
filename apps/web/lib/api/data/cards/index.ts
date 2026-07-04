import { api, type ApiOptions } from "../../client";
import type {
  SavedCardListRes,
  EnrollCardReq,
  EnrollCardRes,
  LinkAutoDebitReq,
  LinkAutoDebitRes,
  ToggleWalletAutoDebitReq,
  ToggleWalletAutoDebitRes,
} from "@/app/api/cards/dto/cards.dto";

/** The requesting user's saved cards (excludes revoked). */
export function fetchCards(options?: ApiOptions) {
  return api.get<SavedCardListRes>("/api/cards", options);
}

/** Start a tokenizing checkout to add a new card. Returns a checkout link to
 * redirect the member to. Pass `circleId` to add from a circle, omit for
 * Settings (verification-only). */
export function enrollCard(body: EnrollCardReq, options?: ApiOptions) {
  return api.post<EnrollCardRes>("/api/cards/enroll", body, options);
}

/** Revoke a saved card (Nomba token delete + unbind from all circles). */
export function revokeCard(id: string, options?: ApiOptions) {
  return api.del<{ success: boolean }>(`/api/cards/${id}`, undefined, options);
}

/** Bind a saved card to auto-debit this circle. */
export function linkAutoDebit(circleId: string, body: LinkAutoDebitReq, options?: ApiOptions) {
  return api.post<LinkAutoDebitRes>(`/api/circles/${circleId}/auto-debit`, body, options);
}

/** Turn off auto-debit for this circle only. */
export function unlinkAutoDebit(circleId: string, options?: ApiOptions) {
  return api.del<{ success: boolean }>(`/api/circles/${circleId}/auto-debit`, undefined, options);
}

/** Opt this circle in/out of wallet auto-save. */
export function toggleWalletAutoDebit(
  circleId: string,
  body: ToggleWalletAutoDebitReq,
  options?: ApiOptions
) {
  return api.post<ToggleWalletAutoDebitRes>(
    `/api/circles/${circleId}/auto-debit/wallet`,
    body,
    options
  );
}
