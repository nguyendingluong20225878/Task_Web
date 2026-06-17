import { useWallet } from "@solana/wallet-adapter-react";
import Head from "next/head";
import Link from "next/link";
import { RoleGate } from "@/components/auth/role-gate";
import { useRoleState } from "@/lib/auth/role-state";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function JudgeDashboardPage() {
  const { publicKey } = useWallet();
  const { walletAddress } = useRoleState();
  const displayWallet = walletAddress ?? publicKey?.toBase58() ?? null;

  return (
    <>
      <Head>
        <title>Judge Dashboard | Task Web</title>
        <meta name="description" content="Judge dashboard placeholder for Task Web." />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <RoleGate requiredRole="judge">
        <main className="min-h-screen px-4 py-8">
          <section className="mx-auto w-full max-w-5xl">
            <div className="rounded-lg border-4 border-black bg-white p-6 shadow-[8px_8px_0_#111827] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="inline-flex rounded-md border-4 border-black bg-[var(--accent)] px-3 py-1 text-xs font-black uppercase">
                    Solana Devnet
                  </span>
                  <h1 className="mt-4 text-3xl font-black text-gray-950 sm:text-4xl">
                    Judge Dashboard
                  </h1>
                  <p className="mt-3 max-w-2xl font-bold text-gray-700">
                    Workspace cho judge sẽ được nối với flow review dispute sau.
                  </p>
                </div>
                <Link
                  href="/console"
                  className="inline-flex items-center justify-center rounded-lg border-4 border-black bg-white px-4 py-3 text-sm font-black text-gray-950 shadow-[4px_4px_0_#111827] transition hover:-translate-y-0.5 hover:bg-[var(--primary)]"
                >
                  Open Web3Console
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border-4 border-black bg-[var(--muted)] p-4">
                  <p className="text-xs font-black uppercase text-gray-500">Wallet</p>
                  <p className="mt-2 break-all font-black text-gray-950">
                    {displayWallet ? shortAddress(displayWallet) : "Checking..."}
                  </p>
                </div>
                <div className="rounded-lg border-4 border-black bg-white p-4">
                  <p className="text-xs font-black uppercase text-gray-500">Role</p>
                  <p className="mt-2 font-black text-gray-950">Judge</p>
                </div>
                <div className="rounded-lg border-4 border-black bg-white p-4">
                  <p className="text-xs font-black uppercase text-gray-500">Status</p>
                  <p className="mt-2 font-black text-gray-950">Ready</p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border-4 border-black bg-white p-5">
                <h2 className="text-xl font-black text-gray-950">Judge tools</h2>
                <p className="mt-2 font-bold text-gray-700">
                  Placeholder an toàn. Chưa có transaction, MongoDB call, hoặc mock dispute.
                </p>
              </div>
            </div>
          </section>
        </main>
      </RoleGate>
    </>
  );
}
