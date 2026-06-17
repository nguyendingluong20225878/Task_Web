import { writable } from "svelte/store";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export type UserRole = "requestor" | "worker" | "judge" | "payer";

type SignableTransaction = Transaction | VersionedTransaction;

export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: (args?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T extends SignableTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends SignableTransaction>(transactions: T[]) => Promise<T[]>;
  on?: (event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export type WalletState = {
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  shortAddress: string;
  role: UserRole;
  provider: PhantomProvider | null;
  error: string;
};

function shortenAddress(publicKey: string | null) {
  if (!publicKey) return "";
  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

function getPhantom() {
  if (typeof window === "undefined") return null;
  return window.solana?.isPhantom ? window.solana : null;
}

function stateFromProvider(provider: PhantomProvider, role: UserRole): WalletState {
  const publicKey = provider.publicKey?.toBase58() ?? null;
  return {
    connected: Boolean(publicKey),
    connecting: false,
    publicKey,
    shortAddress: shortenAddress(publicKey),
    role,
    provider,
    error: "",
  };
}

function createWalletStore() {
  const initialState: WalletState = {
    connected: false,
    connecting: false,
    publicKey: null,
    shortAddress: "",
    role: "requestor",
    provider: null,
    error: "",
  };
  const { subscribe, set, update } = writable<WalletState>(initialState);

  return {
    subscribe,
    detect: () => {
      const provider = getPhantom();
      update((state) =>
        provider
          ? { ...stateFromProvider(provider, state.role), connecting: false }
          : { ...state, provider: null }
      );
    },
    connect: async () => {
      const provider = getPhantom();
      if (!provider) {
        update((state) => ({
          ...state,
          error: "Phantom is not installed. Install Phantom and switch it to Devnet.",
        }));
        return;
      }

      update((state) => ({ ...state, connecting: true, error: "" }));
      try {
        await provider.connect();
        update((state) => stateFromProvider(provider, state.role));
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : "Wallet connection was rejected.";
        update((state) => ({ ...state, connecting: false, error: message }));
      }
    },
    disconnect: async () => {
      const provider = getPhantom();
      if (provider) {
        await provider.disconnect().catch(() => undefined);
      }
      set(initialState);
    },
    setRole: (role: UserRole) => update((state) => ({ ...state, role })),
    setPublicKey: (publicKey: string | null) =>
      update((state) => ({
        ...state,
        connected: Boolean(publicKey),
        publicKey,
        shortAddress: shortenAddress(publicKey),
      })),
  };
}

export const walletStore = createWalletStore();
