import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { type Role, useRoleState } from "@/lib/auth/role-state";

type RoleGuardStatus = "loading" | "redirecting" | "allowed";

type UseRoleGuardResult = {
  status: RoleGuardStatus;
  isAllowed: boolean;
};

function isCurrentPath(asPath: string, targetPath: string): boolean {
  return asPath.split("?")[0] === targetPath;
}

export function useRoleGuard(requiredRole?: Role): UseRoleGuardResult {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const { activeRole, getDashboardPath, isRoleLoading } = useRoleState();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!connected || !publicKey) {
      if (!isCurrentPath(router.asPath, "/")) {
        void router.replace("/");
      }
      return;
    }

    if (isRoleLoading) {
      return;
    }

    if (!activeRole) {
      if (!isCurrentPath(router.asPath, "/onboarding")) {
        void router.replace("/onboarding");
      }
      return;
    }

    if (requiredRole && activeRole !== requiredRole) {
      const dashboardPath = getDashboardPath(activeRole);

      if (!isCurrentPath(router.asPath, dashboardPath)) {
        void router.replace(dashboardPath);
      }
    }
  }, [
    activeRole,
    connected,
    getDashboardPath,
    isRoleLoading,
    publicKey,
    requiredRole,
    router,
  ]);

  if (!router.isReady || isRoleLoading) {
    return { status: "loading", isAllowed: false };
  }

  if (!connected || !publicKey || !activeRole || (requiredRole && activeRole !== requiredRole)) {
    return { status: "redirecting", isAllowed: false };
  }

  return { status: "allowed", isAllowed: true };
}

export function RoleGate({
  requiredRole,
  children,
}: {
  requiredRole?: Role;
  children: ReactNode;
}) {
  const { isAllowed } = useRoleGuard(requiredRole);

  if (!isAllowed) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10 text-sm font-semibold text-gray-600">
        Đang kiểm tra quyền truy cập...
      </main>
    );
  }

  return <>{children}</>;
}
