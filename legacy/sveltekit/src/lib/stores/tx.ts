import { writable } from "svelte/store";

export type TxStatus =
  | "idle"
  | "uploading"
  | "building"
  | "awaiting_signature"
  | "submitted"
  | "confirmed"
  | "failed";

export type TxState = {
  status: TxStatus;
  message: string;
  signature?: string;
  error?: string;
};

function createTxStore() {
  const { subscribe, set, update } = writable<TxState>({
    status: "idle",
    message: "",
  });

  return {
    subscribe,
    setStatus: (status: TxStatus, message = "") =>
      set({
        status,
        message,
      }),
    setSignature: (signature: string, message = "Transaction confirmed.") =>
      update((state) => ({
        ...state,
        status: "confirmed",
        message,
        signature,
      })),
    setError: (error: string) =>
      set({
        status: "failed",
        message: "Transaction failed.",
        error,
      }),
    reset: () =>
      set({
        status: "idle",
        message: "",
      }),
  };
}

export const txStore = createTxStore();
