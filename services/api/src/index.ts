export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CHAIN_REJECTED"
  | "INDEXER_STALE";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export type WalletAuth = {
  wallet: string;
  signature: string;
  message: string;
};

export type TransactionDraft = {
  instruction:
    | "initialize_task"
    | "stake_to_unlock"
    | "submit_and_assign"
    | "judge_vote"
    | "settle_payment"
    | "cancel_open_task"
    | "cancel_expired_task"
    | "claim_judge_fee";
  accounts: Record<string, string>;
  args: Record<string, unknown>;
};

export type PendingTransactionIntent = {
  id: string;
  wallet: string;
  draft: TransactionDraft;
  createdAt: Date;
  status: "pending_signature";
};

export function requireWalletAuth(auth?: WalletAuth) {
  if (!auth?.wallet || !auth.signature || !auth.message) {
    throw new ApiError("UNAUTHORIZED", "Wallet auth is required.", 401);
  }
}

export function createTransactionIntent(
  auth: WalletAuth,
  draft: TransactionDraft
): PendingTransactionIntent {
  requireWalletAuth(auth);
  if (!draft.instruction || !draft.accounts || !draft.args) {
    throw new ApiError("VALIDATION_ERROR", "Invalid transaction draft.");
  }

  return {
    id: `${draft.instruction}:${auth.wallet}:${Date.now()}`,
    wallet: auth.wallet,
    draft,
    createdAt: new Date(),
    status: "pending_signature",
  };
}

export function assertReadModelFresh(
  lastIndexedSlot: number,
  minimumSlot: number
) {
  if (lastIndexedSlot < minimumSlot) {
    throw new ApiError("INDEXER_STALE", "Indexed read model is stale.", 409);
  }
}
