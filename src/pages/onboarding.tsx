import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { ROLES, type Role, useRoleState } from "@/lib/auth/role-state";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  {
    ssr: false,
    loading: () => (
      <div className="h-12 w-44 rounded-lg border-4 border-black bg-white shadow-[5px_5px_0_#111827]" />
    ),
  },
);

const ROLE_LABELS: Record<Role, string> = {
  requestor: "Requestor",
  worker: "Worker",
  judge: "Judge",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  requestor: "Create tasks, fund rewards, and review submissions.",
  worker: "Find open tasks and submit completed work.",
  judge: "Review disputes and help settle outcomes.",
};

function shortAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4);
}

export default function OnboardingPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const {
    activeRole,
    getDashboardPath,
    isRoleLoading,
    roles,
    setActiveRoleForConnectedWallet,
    setRoleForConnectedWallet,
    walletAddress,
  } = useRoleState();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const isChangingRole = router.isReady && router.query.changeRole === "1";

  useEffect(() => {
    if (!router.isReady || !connected || isRoleLoading || isChangingRole || !activeRole) {
      return;
    }
    void router.replace(getDashboardPath(activeRole));
  }, [activeRole, connected, getDashboardPath, isChangingRole, isRoleLoading, router]);

  const roleOptions = useMemo(() => ROLES.map((role) => role), []);
  const availableRoles = roleOptions.filter((role) => !roles.includes(role));

  function handleChooseRole(role: Role) {
    setSelectedRole(role);
    if (roles.includes(role)) {
      setActiveRoleForConnectedWallet(role);
    } else {
      setRoleForConnectedWallet(role);
    }
    void router.replace(getDashboardPath(role));
  }

  const isRedirecting = !connected || (connected && !isChangingRole && activeRole);
  const title = isChangingRole ? "Manage Roles" : "Choose Your Role";

  return (
    <>
      <Head>
        <title>{title} | Task Web</title>
        <meta name="description" content="Choose the roles for the connected Task Web wallet." />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <main className="min-h-screen px-4 py-10">
        <section className="mx-auto flex min-h-[calc(100vh-160px)] w-full max-w-4xl items-center justify-center">
          <div className="w-full rounded-lg border-4 border-black bg-white p-6 shadow-[8px_8px_0_#111827] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="inline-flex rounded-md border-4 border-black bg-[var(--accent)] px-3 py-1 text-xs font-black uppercase">
                  Solana Devnet
                </span>
                <h1 className="mt-4 text-3xl font-black text-gray-950 sm:text-5xl">{title}</h1>
                <p className="mt-3 max-w-xl font-bold text-gray-700">
                  A wallet can use every role, but only one role on each task.
                </p>
              </div>
              <WalletMultiButton />
            </div>

            <div className="mt-6 rounded-lg border-4 border-black bg-[var(--muted)] p-4 text-sm font-bold text-gray-700">
              {walletAddress ? "Wallet: " + shortAddress(walletAddress) : "Wallet: checking connection..."}
            </div>

            {isRoleLoading || isRedirecting ? (
              <p className="mt-6 font-black text-gray-800">Dang kiem tra role...</p>
            ) : (
              <div className="mt-7 grid gap-6">
                {isChangingRole && roles.length > 0 ? (
                  <div>
                    <p className="mb-3 text-sm font-black uppercase text-gray-600">Roles da co</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {roles.map((role) => (
                        <RoleCard
                          key={role}
                          disabled={selectedRole !== null}
                          label={activeRole === role ? ROLE_LABELS[role] + " (active)" : ROLE_LABELS[role]}
                          onClick={() => handleChooseRole(role)}
                          role={role}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {availableRoles.length > 0 ? (
                  <div>
                    <p className="mb-3 text-sm font-black uppercase text-gray-600">
                      {roles.length ? "Them role" : "Chon role dau tien"}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {availableRoles.map((role) => (
                        <RoleCard
                          key={role}
                          disabled={selectedRole !== null}
                          label={ROLE_LABELS[role]}
                          onClick={() => handleChooseRole(role)}
                          role={role}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function RoleCard({
  disabled,
  label,
  onClick,
  role,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  role: Role;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-40 rounded-lg border-4 border-black bg-white p-5 text-left shadow-[5px_5px_0_#111827] transition hover:-translate-y-0.5 hover:bg-[var(--primary)] disabled:cursor-wait disabled:opacity-70"
    >
      <span className="text-xl font-black text-gray-950">{label}</span>
      <span className="mt-3 block text-sm font-bold text-gray-700">{ROLE_DESCRIPTIONS[role]}</span>
    </button>
  );
}
