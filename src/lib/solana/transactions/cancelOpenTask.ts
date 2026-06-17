import {
  cancelOpenTask as cancelOpenTaskOnDevnet,
  type AnchorWalletLike,
  type Web3Result,
} from "$lib/solana/client";

export type CancelOpenTaskResult = Web3Result;

export async function cancelOpenTask(
  wallet: AnchorWalletLike | unknown,
  taskId: string,
  requestorTokenAccount?: string
): Promise<CancelOpenTaskResult> {
  if (!wallet || typeof wallet !== "object" || !("signTransaction" in wallet)) {
    throw new Error("Devnet mode requires the connected Phantom provider, not a mock wallet string.");
  }
  return cancelOpenTaskOnDevnet(wallet as AnchorWalletLike, taskId, requestorTokenAccount);
}
