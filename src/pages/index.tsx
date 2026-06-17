import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useRoleState } from "@/lib/auth/role-state";
import { PROGRAM_ID, RPC_URL } from "@/lib/solana/client";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <div className="h-12 w-44 rounded-lg border-4 border-black bg-white shadow-[5px_5px_0_#111827]" />
    ),
  },
);

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function IndexPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { activeRole, getDashboardPath, isRoleLoading, walletAddress } = useRoleState();

  useEffect(() => {
    if (!connected || isRoleLoading) {
      return;
    }

    if (!activeRole) {
      void router.replace("/onboarding");
      return;
    }

    void router.replace(getDashboardPath(activeRole));
  }, [activeRole, connected, getDashboardPath, isRoleLoading, router]);

  const statusText = connected
    ? "Dang kiem tra role..."
    : "Ket noi vi de tiep tuc onboarding.";

  return (
    <>
      <Head>
        <title>Connect Wallet | Task Web</title>
        <meta name="description" content="Connect a Solana wallet to continue Task Web onboarding." />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <main className="min-h-screen px-4 py-10">
        <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-lg border-4 border-black bg-white p-6 shadow-[8px_8px_0_#111827] sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-gray-600">
              Solana Devnet
            </p>
            <h1 className="mt-2 text-3xl font-black text-gray-950 sm:text-5xl">
              Connect Wallet
            </h1>
            <p className="mt-3 max-w-xl font-bold text-gray-700">
              {statusText}
            </p>

            <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <WalletMultiButton />
              <div className="text-sm font-bold text-gray-600">
                {walletAddress ? `Wallet: ${shortAddress(walletAddress)}` : "Wallet: chua ket noi"}
              </div>
            </div>

            <dl className="mt-8 grid gap-3 border-t-4 border-black pt-5 text-sm font-bold sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Network</dt>
                <dd className="break-all text-gray-950">{RPC_URL.includes("devnet") ? "Devnet" : RPC_URL}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Program ID</dt>
                <dd className="break-all text-gray-950">{PROGRAM_ID.toBase58()}</dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    </>
  );
}
