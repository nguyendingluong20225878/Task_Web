export type ChainIndexInstruction =
  | "initialize_task"
  | "settle_payment"
  | "stake_to_unlock"
  | "cancel_open_task"
  | "submit_and_assign"
  | "judge_vote"
  | "claim_judge_fee";

export type IndexTaskAfterTransactionInput = {
  taskId: string | number;
  signature: string;
  instruction: ChainIndexInstruction;
  actor: string;
  slot?: number;
};

export type IndexTaskAfterTransactionResult = {
  ok: true;
  taskId: string;
  taskPda: string;
  indexedSlot: number;
  signature: string;
};

type IndexTaskErrorResponse = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

export async function indexTaskAfterTransaction(
  input: IndexTaskAfterTransactionInput
): Promise<IndexTaskAfterTransactionResult> {
  const response = await fetch("/api/chain/index-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: String(input.taskId),
      signature: input.signature,
      instruction: input.instruction,
      actor: input.actor,
      slot: input.slot,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | IndexTaskAfterTransactionResult
    | IndexTaskErrorResponse
    | null;

  if (!response.ok || !payload?.ok) {
    const message =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : `Index task API failed with HTTP ${response.status}.`;
    const code =
      payload && "error" in payload && payload.error?.code
        ? ` (${payload.error.code})`
        : "";
    throw new Error(`MongoDB indexing failed${code}: ${message}`);
  }

  return payload;
}
