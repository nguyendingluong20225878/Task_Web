import dynamic from "next/dynamic";
import Head from "next/head";

const Web3Console = dynamic(() => import("@/components/web3-console").then((mod) => mod.Web3Console), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen">
      <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col gap-4 py-7">
        <section className="rounded-lg border-4 border-black bg-white p-5 shadow-[8px_8px_0_#111827]">
          <p className="mb-1 text-xs font-black uppercase">Solana Devnet</p>
          <h1 className="text-3xl font-black sm:text-5xl">Task Contract Web3 Console</h1>
          <p className="mt-2 font-bold">Loading wallet console...</p>
        </section>
      </div>
    </main>
  ),
});

export default function ConsolePage() {
  return (
    <>
      <Head>
        <title>Web3 Console</title>
        <meta name="description" content="Solana Devnet task contract console" />
        <link rel="icon" href="/favicon.svg" />
      </Head>
      <Web3Console />
    </>
  );
}
