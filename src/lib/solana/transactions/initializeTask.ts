import {
  initializeTask as initializeTaskOnDevnet,
  type AnchorWalletLike,
  type InitializeTaskInput,
  type Web3Result,
} from "$lib/solana/client";

export type InitializeTaskResult = Web3Result;

export async function initializeTask(
  wallet: AnchorWalletLike | unknown,
  input: InitializeTaskInput | Record<string, unknown>
): Promise<InitializeTaskResult> {
  if (!wallet || typeof wallet !== "object" || !("signTransaction" in wallet)) {
    throw new Error("Devnet mode requires the connected Phantom provider, not a mock wallet string.");
  }
  return initializeTaskOnDevnet(wallet as AnchorWalletLike, input as InitializeTaskInput);
}
