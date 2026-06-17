"use client";

import "@/lib/polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { useMemo, type ComponentType, type ReactNode } from "react";
import { RPC_URL } from "@/lib/solana/client";

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const SolanaConnectionProvider = ConnectionProvider as ComponentType<any>;
  const SolanaWalletProvider = WalletProvider as ComponentType<any>;
  const SolanaWalletModalProvider = WalletModalProvider as ComponentType<any>;

  return (
    <SolanaConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <SolanaWalletModalProvider>{children}</SolanaWalletModalProvider>
      </SolanaWalletProvider>
    </SolanaConnectionProvider>
  );
}
