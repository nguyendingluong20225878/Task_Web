"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ClipboardList,
  Hammer,
  LayoutDashboard,
  Send,
  ShieldCheck,
  TerminalSquare,
  UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Role, useRoleState } from "@/lib/auth/role-state";
import { cn } from "@/lib/utils";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match?: "exact" | "prefix";
};

const roleLabels: Record<Role, string> = {
  requestor: "Requestor",
  worker: "Worker",
  judge: "Judge",
};

const requestorNavItems: NavItem[] = [
  { href: "/requestor", label: "Requestor", icon: LayoutDashboard },
  { href: "/requestor/tasks", label: "Task của tôi", icon: ClipboardList, match: "prefix" },
  { href: "/requestor/submissions", label: "Submission", icon: Send },
];

const roleNavItems: Record<Role, NavItem[]> = {
  requestor: requestorNavItems,
  worker: [{ href: "/worker", label: "Worker", icon: Hammer }],
  judge: [{ href: "/judge", label: "Judge", icon: ShieldCheck }],
};

const consoleNavItem: NavItem = {
  href: "/console",
  label: "Console",
  icon: TerminalSquare,
};

function shortenWalletAddress(walletAddress: string): string {
  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.match === "prefix") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

export function AppNavigation() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const { activeRole, isRoleLoading } = useRoleState();
  const pathname = router.asPath.split("?")[0] || "/";
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null;
  const roleItems = connected && activeRole ? roleNavItems[activeRole] : [];
  const navItems: NavItem[] = [
    ...(!connected ? [{ href: "/", label: "Kết nối", icon: LayoutDashboard }] : []),
    ...(connected && !isRoleLoading && !activeRole
      ? [{ href: "/onboarding", label: "Chọn role", icon: UserCog }]
      : []),
    ...roleItems,
    consoleNavItem,
  ];

  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-slate-950 bg-[#F7F7F2]/95 backdrop-blur">
      <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col gap-3 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="text-base font-black text-slate-950" href="/">
            Task Web3
          </Link>
          <Badge>Solana Devnet</Badge>
          {walletAddress ? <Badge>{shortenWalletAddress(walletAddress)}</Badge> : null}
          {activeRole ? <Badge>Role: {roleLabels[activeRole]}</Badge> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between xl:justify-end">
          <nav className="flex flex-wrap gap-2" aria-label="Điều hướng chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(pathname, item);

              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? "default" : "secondary"}
                  size="sm"
                >
                  <Link
                    className={cn("gap-2", isActive && "pointer-events-none")}
                    href={item.href}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
            {connected ? (
              <Button
                asChild
                variant={pathname === "/onboarding" ? "default" : "secondary"}
                size="sm"
              >
                <Link className="gap-2" href="/onboarding?changeRole=1">
                  <UserCog className="size-4" />
                  Đổi role
                </Link>
              </Button>
            ) : null}
          </nav>
          <div className="min-h-9 [&_.wallet-adapter-button]:h-9 [&_.wallet-adapter-button]:rounded-lg [&_.wallet-adapter-button]:border-2 [&_.wallet-adapter-button]:border-slate-950 [&_.wallet-adapter-button]:bg-white [&_.wallet-adapter-button]:px-3 [&_.wallet-adapter-button]:text-xs [&_.wallet-adapter-button]:font-extrabold [&_.wallet-adapter-button]:text-slate-950 [&_.wallet-adapter-button]:shadow-[3px_3px_0_#111827]">
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  );
}
